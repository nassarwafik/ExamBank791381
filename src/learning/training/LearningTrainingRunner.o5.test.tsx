// @vitest-environment happy-dom
// Tadris+ O5 (docs/enterprise-training-keys-o5.md) — when the server withholds the post-submit review (an open official homework
// of the student's class, or a teacher without «رؤية مفاتيح الإجابة»), the runner shows the score and says why, and renders no
// per-question review at all. The browser never decides: it renders what the server sent. TEST data only.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
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
  training: { trainingId: "T02", order: 2, label: "تدريب 2", requiredModuleId: "791381-m02", courseId: "791381", available: true, title: "أنظمة العد", questionCount: 10, totalMarks: 100, maxPoints: 40 },
  exam: { examId: "LIB-T02", title: "أنظمة العد", questions, totalMarks: 100 },
  ...(best ? { best } : {}),
});
const graded = (actor: "student" | "teacher", improved = true): TrainingSubmitResponse => ({
  ok: true, actor, persisted: actor === "student",
  result: {
    correctCount: 8, questionCount: 10, score: 80, totalMarks: 100, percentage: 80,
    review: questions.map((q, i) => ({ questionId: q.examQuestionId!, questionNumber: i + 1, correct: i < 8, chosenIndex: 0, correctOptionIndex: i < 8 ? 0 : 2, hint: `تلميح_سري_${i + 1}` })),
  },
  ...(actor === "student" ? { practice: { bestPercentage: 80, bestPoints: 32, maxPoints: 40, attempts: 1, lastCompletedAt: "2026-09-19T00:00:00.000Z", improved, pointsGained: improved ? 32 : 0, earnedPoints: 32 } } : {}),
});
function client(over: Partial<TrainingClient> = {}, actor: "student" | "teacher" = "student"): TrainingClient & { submit: ReturnType<typeof vi.fn> } {
  const submit = vi.fn(async () => graded(actor));
  return { list: vi.fn(async () => ({ ok: true as const, actor, trainings: [] })), load: vi.fn(async () => loaded()), submit, ...over } as TrainingClient & { submit: ReturnType<typeof vi.fn> };
}
const answerAll = () => { for (const q of questions) fireEvent.click(within(screen.getByText(q.text).closest(".iex-q") as HTMLElement).getAllByRole("radio")[0]); };
const submitBtn = () => screen.getByRole("button", { name: /أرسل الإجابات|جارٍ التصحيح/ }) as HTMLButtonElement;

const withheld = (actor: "student" | "teacher", reason: "assignment" | "keys"): TrainingSubmitResponse => {
  const g = graded(actor);
  return { ...g, result: { ...g.result, review: [], reviewWithheld: reason } };
};
async function solve(actor: "student" | "teacher", reason: "assignment" | "keys") {
  const c = client({ submit: vi.fn(async () => withheld(actor, reason)) as TrainingClient["submit"] }, actor);
  render(<LearningTrainingRunner trainingId="T02" actor={actor} client={c} onExit={vi.fn()} />);
  await screen.findByRole("heading", { level: 2, name: "أنظمة العد" });
  answerAll();
  fireEvent.click(submitBtn());
  await screen.findByRole("heading", { level: 2, name: "أنظمة العد" });
  return await screen.findByRole("note");
}

describe("O5 — a withheld review: the score, the reason, no per-question review", () => {
  it("an open homework of the student's class", async () => {
    const note = await solve("student", "assignment");
    expect(note.textContent).toBe("هذا الامتحان واجب مفتوح لصفك الآن، فتُعرض درجتك فقط. تظهر المراجعة الكاملة بعد إغلاق الواجب.");
    expect(screen.getAllByText("80%").length).toBeGreaterThan(0);   // the score stays
    expect(screen.queryByRole("region", { name: "مراجعة الأسئلة" })).toBeNull();
    expect(document.querySelectorAll(".learning-training-review-item")).toHaveLength(0);
  });
  it("a teacher without «رؤية مفاتيح الإجابة»", async () => {
    const note = await solve("teacher", "keys");
    expect(note.textContent).toBe("تُعرض الدرجة فقط: حسابك لا يتضمن رؤية مفاتيح الإجابة.");
    expect(document.querySelectorAll(".learning-training-review-item")).toHaveLength(0);
  });
  it("without reviewWithheld, the review renders as before", async () => {
    const c = client();
    render(<LearningTrainingRunner trainingId="T02" actor="student" client={c} onExit={vi.fn()} />);
    await screen.findByRole("heading", { level: 2, name: "أنظمة العد" });
    answerAll();
    fireEvent.click(submitBtn());
    expect(await screen.findByRole("region", { name: "مراجعة الأسئلة" })).toBeTruthy();
    expect(document.querySelectorAll(".learning-training-review-item")).toHaveLength(10);
    expect(screen.queryByRole("note")).toBeNull();
  });
});
