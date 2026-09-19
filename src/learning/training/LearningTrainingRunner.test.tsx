// @vitest-environment happy-dom
// Learning Practice — the ONE shared training runner. With an injected client it loads the sanitized exam, renders
// the ten MCQs through the student exam's own question primitive, enables submission only when every question is
// answered, sends ONLY the answers, and renders the SERVER's grading: summary, Strength points (student), the
// per-question review (chosen / right option / hint) and the free retry. No score is computed in the browser.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningTrainingRunner from "./LearningTrainingRunner";
import type { TrainingClient, TrainingLoadResponse, TrainingSubmitResponse } from "./types";
import type { Question } from "../../StudentQuestionCard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const questions: Question[] = Array.from({ length: 10 }, (_, i) => ({
  examQuestionId: `LIB-T02-Q${String(i + 1).padStart(2, "0")}`, presentationType: "multipleChoice", marks: 10,
  text: `سؤال رقم ${i + 1}`, textHtml: "",
  options: [{ value: "0", text: `خيار أ ${i + 1}` }, { value: "1", text: `خيار ب ${i + 1}` }, { value: "2", text: `خيار ج ${i + 1}` }, { value: "3", text: `خيار د ${i + 1}` }],
  answer: {}, hint: "", teacherNote: "", aiInstruction: "", history: [], redoStack: [],
} as unknown as Question));
const loaded = (best?: TrainingLoadResponse["best"]): TrainingLoadResponse => ({
  ok: true, actor: "student",
  training: { trainingId: "T02", order: 2, label: "تدريب 2", requiredModuleId: "791381-m02", courseId: "791381", available: true, title: "أنظمة العد", questionCount: 10, totalMarks: 100, maxPoints: 25 },
  exam: { examId: "LIB-T02", title: "أنظمة العد", questions, totalMarks: 100 },
  ...(best ? { best } : {}),
});
const graded = (actor: "student" | "teacher", improved = true): TrainingSubmitResponse => ({
  ok: true, actor, persisted: actor === "student",
  result: {
    correctCount: 8, questionCount: 10, score: 80, totalMarks: 100, percentage: 80,
    review: questions.map((q, i) => ({ questionId: q.examQuestionId!, questionNumber: i + 1, correct: i < 8, chosenIndex: 0, correctOptionIndex: i < 8 ? 0 : 2, hint: `تلميح_سري_${i + 1}` })),
  },
  ...(actor === "student" ? { practice: { bestPercentage: 80, bestPoints: 20, maxPoints: 25, attempts: 1, lastCompletedAt: "2026-09-19T00:00:00.000Z", improved, pointsGained: improved ? 20 : 0, earnedPoints: 20 } } : {}),
});
function client(over: Partial<TrainingClient> = {}, actor: "student" | "teacher" = "student"): TrainingClient & { submit: ReturnType<typeof vi.fn> } {
  const submit = vi.fn(async () => graded(actor));
  return { list: vi.fn(async () => ({ ok: true as const, actor, trainings: [] })), load: vi.fn(async () => loaded()), submit, ...over } as TrainingClient & { submit: ReturnType<typeof vi.fn> };
}
const answerAll = () => { for (const q of questions) fireEvent.click(within(screen.getByText(q.text).closest(".iex-q") as HTMLElement).getAllByRole("radio")[0]); };
const submitBtn = () => screen.getByRole("button", { name: /أرسل الإجابات|جارٍ التصحيح/ }) as HTMLButtonElement;

describe("LearningTrainingRunner — solving", () => {
  it("loads the sanitized exam through the client and renders ten MCQ cards with radios; submit waits for all answers", async () => {
    const c = client();
    render(<LearningTrainingRunner trainingId="T02" actor="student" client={c} onExit={vi.fn()} />);
    expect(await screen.findByRole("heading", { level: 2, name: "أنظمة العد" })).toBeTruthy();
    expect(c.load).toHaveBeenCalledWith("T02");
    expect(document.querySelectorAll(".iex-q").length).toBe(10);
    expect(screen.getAllByRole("radio").length).toBe(40);
    expect(screen.getByText("تدريب 2")).toBeTruthy();
    expect(screen.getByText("حتى 25 نقطة تقوية")).toBeTruthy();
    expect(submitBtn().disabled).toBe(true);
    expect(screen.getByText(/أسئلة مُجابة/).textContent).toBe("0 / 10 أسئلة مُجابة");
    fireEvent.click(screen.getAllByRole("radio")[1]);
    expect(screen.getByText(/أسئلة مُجابة/).textContent).toBe("1 / 10 أسئلة مُجابة");
    expect(submitBtn().disabled).toBe(true);
    answerAll();
    expect(screen.getByText(/أسئلة مُجابة/).textContent).toBe("10 / 10 أسئلة مُجابة");
    expect(submitBtn().disabled).toBe(false);
    // no hint / answer-key vocabulary before submission
    const html = document.body.innerHTML;
    for (const banned of ["تلميح_سري", "correct", "الإجابة الصحيحة"]) expect(html, banned).not.toContain(banned);
    expect(c.submit).not.toHaveBeenCalled();
  });

  it("sends ONLY the answers map (never a score/percentage/points) and renders the server's result + review", async () => {
    const c = client();
    render(<LearningTrainingRunner trainingId="T02" actor="student" client={c} onExit={vi.fn()} />);
    await screen.findByRole("heading", { level: 2, name: "أنظمة العد" });
    answerAll();
    fireEvent.click(screen.getAllByRole("radio")[1]);          // Q1 → option ب
    fireEvent.click(submitBtn());
    expect(await screen.findByRole("heading", { level: 2, name: "أنظمة العد" })).toBeTruthy();
    await screen.findByText("مراجعة الإجابات");
    expect(c.submit).toHaveBeenCalledTimes(1);
    const [id, answers] = c.submit.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe("T02");
    expect(Object.keys(answers).length).toBe(10);
    expect(answers["LIB-T02-Q01"]).toEqual({ kind: "choice", index: 1 });
    expect(answers["LIB-T02-Q02"]).toEqual({ kind: "choice", index: 0 });
    expect(JSON.stringify(c.submit.mock.calls[0])).not.toMatch(/score|percentage|points/);
    // summary: "8 / 10 إجابات صحيحة", "80%", "20 / 25 نقاط تقوية"
    expect(screen.getByText(/إجابات صحيحة$/).textContent).toBe("8 / 10 إجابات صحيحة");
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.getByText(/نقاط تقوية$/).textContent).toBe("20 / 25 نقاط تقوية");
    expect(screen.getByRole("status").textContent).toContain("تحسّنت أفضل نتيجتك: +20 نقاط قوة.");
    // review: 8 right, 2 wrong; wrong rows show the right option + hint; right rows show chosen only
    const items = screen.getAllByRole("listitem").filter(li => li.classList.contains("learning-training-review-item"));
    expect(items.length).toBe(10);
    expect(items.filter(li => li.classList.contains("is-right")).length).toBe(8);
    expect(items.filter(li => li.classList.contains("is-wrong")).length).toBe(2);
    const wrong = items[9];
    expect(within(wrong).getByText("غير صحيح")).toBeTruthy();
    const lines = (li: HTMLElement) => [...li.querySelectorAll(".learning-training-review-line, .learning-training-review-hint")].map(p => p.textContent);
    expect(lines(wrong)).toEqual(["إجابتكخيار أ 10", "الإجابة الصحيحةخيار ج 10", "تلميحتلميح_سري_10"]);
    expect(within(items[0]).getByText("صحيح")).toBeTruthy();
    expect(lines(items[0])).toEqual(["إجابتكخيار أ 1", "تلميحتلميح_سري_1"]);
    // right/wrong is never colour-only (an icon + a word) and the DOM uses is-right/is-wrong, never a "correct" attribute
    expect(wrong.querySelector(".learning-training-mark svg")).toBeTruthy();
    expect(document.body.innerHTML).not.toMatch(/correct=|data-correct|class="[^"]*correct/);
  });

  it("«أعد التدريب» restarts with cleared answers (no attempt limit); «العودة» calls onExit", async () => {
    const c = client(); const onExit = vi.fn();
    render(<LearningTrainingRunner trainingId="T02" actor="student" client={c} onExit={onExit} exitLabel="العودة إلى الصفحة" />);
    await screen.findByRole("heading", { level: 2, name: "أنظمة العد" });
    answerAll(); fireEvent.click(submitBtn());
    await screen.findByText("مراجعة الإجابات");
    fireEvent.click(screen.getByRole("button", { name: "أعد التدريب" }));
    expect(await screen.findByText(/أسئلة مُجابة/)).toBeTruthy();
    expect(screen.getByText(/أسئلة مُجابة/).textContent).toBe("0 / 10 أسئلة مُجابة");
    expect(screen.queryByText("مراجعة الإجابات")).toBeNull();
    expect(c.load).toHaveBeenCalledTimes(1);                   // the exam is not re-fetched for a retry
    fireEvent.click(screen.getAllByRole("button", { name: "العودة إلى الصفحة" })[0]);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("a non-improving retry says the saved best stays (never lowered)", async () => {
    const c = client({ submit: vi.fn(async () => graded("student", false)) }, "student");
    render(<LearningTrainingRunner trainingId="T02" actor="student" client={c} onExit={vi.fn()} />);
    await screen.findByRole("heading", { level: 2, name: "أنظمة العد" });
    answerAll(); fireEvent.click(submitBtn());
    await screen.findByText("مراجعة الإجابات");
    expect(screen.getByRole("status").textContent).toContain("أفضل نتيجتك المحفوظة ما زالت 80%");
  });

  it("teacher actor: the same runner, a preview note, no Strength points line", async () => {
    const c = client({}, "teacher");
    render(<LearningTrainingRunner trainingId="T02" actor="teacher" client={c} onExit={vi.fn()} />);
    await screen.findByRole("heading", { level: 2, name: "أنظمة العد" });
    expect(screen.queryByText("حتى 25 نقطة تقوية")).toBeNull();
    answerAll(); fireEvent.click(submitBtn());
    await screen.findByText("مراجعة الإجابات");
    expect(screen.getByText(/إجابات صحيحة$/).textContent).toBe("8 / 10 إجابات صحيحة");
    expect(screen.queryByText(/نقاط تقوية$/)).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("معاينة المعلم: النتيجة لا تُحفظ ولا تُمنح عنها نقاط.");
  });

  it("load failure → the API message as an alert with retry; submit failure → alert, answers kept", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("هذا التدريب غير متاح لصفك بعد.")).mockResolvedValue(loaded());
    const submit = vi.fn().mockRejectedValueOnce(new Error("حدث تعارض مؤقت.")).mockResolvedValue(graded("student"));
    const c = client({ load, submit });
    render(<LearningTrainingRunner trainingId="T03" actor="student" client={c} onExit={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("هذا التدريب غير متاح لصفك بعد.");
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await screen.findByRole("heading", { level: 2, name: "أنظمة العد" });
    answerAll(); fireEvent.click(submitBtn());
    expect((await screen.findByRole("alert")).textContent).toContain("حدث تعارض مؤقت.");
    expect(screen.getByText(/أسئلة مُجابة/).textContent).toBe("10 / 10 أسئلة مُجابة");
    fireEvent.click(submitBtn());
    await screen.findByText("مراجعة الإجابات");
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  });
});
