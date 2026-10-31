// @vitest-environment happy-dom
// 791381s Phase 8C-0 (docs/enterprise-791381s-enrichment-plan.md §11.1, §16) — DEFECT: the Learning-Practice runner rendered the
// student exam's question card WITHOUT the generic `onAnswer` seam, so a REGISTERED question type (multipleSelect, numeric,
// matrix, categorization… — the platform's advanced types) fell back to a no-op: the learner's answer was dropped, the question
// never counted as answered and «أرسل الإجابات» stayed disabled. Fail-first on 58adfae9. The runner now passes `onAnswer`, keeps
// the answer under the question's id, counts it, and sends it with the others (still ONLY the answers).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningTrainingRunner from "./LearningTrainingRunner";
import type { TrainingClient, TrainingLoadResponse, TrainingSubmitResponse } from "./types";
import type { Question } from "../../StudentQuestionCard";
import * as sanitizer from "../../../api/src/lib/student-exam-sanitize.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

const sanitize = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;
/** One legacy MCQ and one REGISTERED type (multipleSelect@1), sanitized exactly as the API serves a training. */
const questions = (): Question[] => sanitize({ examId: "E", title: "t", status: "published", schemaVersion: 2, sections: [{ id: "s1", title: "س", gradingPolicy: "all", stimuli: {}, questions: [
  { examQuestionId: "q1", presentationType: "multipleChoice", text: "ما أكبر مثال على WAN؟", marks: 1, options: [{ text: "الإنترنت" }, { text: "غرفة الحاسوب" }], answer: { correctOptionIndex: 0 } },
  { examQuestionId: "q2", presentationType: "multipleSelect", questionTypeVersion: 1, text: "أي البروتوكولات في طبقة النقل؟", marks: 2, options: [{ id: "o1", text: "TCP" }, { id: "o2", text: "UDP" }, { id: "o3", text: "IP" }], answer: { correctOptionIds: ["o1", "o2"], scoring: "allOrNothing" } },
] }] }).sections[0].questions;
const loaded = (): TrainingLoadResponse => ({
  ok: true, actor: "student",
  training: { trainingId: "T01", order: 1, label: "تدريب 1", requiredModuleId: "791381-m01", courseId: "791381", available: true, title: "أساسيات", questionCount: 2, totalMarks: 3, maxPoints: 40 },
  exam: { examId: "LIB-T01", title: "أساسيات", questions: questions(), totalMarks: 3 },
});
const graded = (): TrainingSubmitResponse => ({
  ok: true, actor: "student", persisted: true,
  result: { correctCount: 2, questionCount: 2, score: 3, totalMarks: 3, percentage: 100, review: [
    { questionId: "q1", questionNumber: 1, correct: true, chosenIndex: 0, correctOptionIndex: 0, hint: "" },
    { questionId: "q2", questionNumber: 2, correct: true, chosenIndex: null, correctOptionIndex: null, hint: "" },
  ] },
  practice: { bestPercentage: 100, bestPoints: 40, maxPoints: 40, attempts: 1, lastCompletedAt: "2026-10-31T00:00:00.000Z", improved: true, pointsGained: 40, earnedPoints: 40 },
} as unknown as TrainingSubmitResponse);

describe("the training runner answers a REGISTERED question type", () => {
  it("multipleSelect: checking options records the answer, counts it, enables «أرسل الإجابات», and sends it with the MCQ", async () => {
    const submit = vi.fn(async () => graded());
    const client = { list: vi.fn(), load: vi.fn(async () => loaded()), submit } as unknown as TrainingClient;
    render(<LearningTrainingRunner trainingId="T01" actor="student" client={client} onExit={() => {}} />);
    await screen.findByText("ما أكبر مثال على WAN؟");
    fireEvent.click(within(screen.getByText("ما أكبر مثال على WAN؟").closest(".iex-q") as HTMLElement).getAllByRole("radio")[0]);
    const group = await screen.findByRole("group", { name: /أي البروتوكولات/ });
    const boxes = within(group).getAllByRole("checkbox");
    fireEvent.click(boxes[0]); fireEvent.click(boxes[1]);
    expect(screen.getByText(/أسئلة مُجابة/).textContent).toContain("2 / 2");
    const send = screen.getByRole("button", { name: "أرسل الإجابات" }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith("T01", { q1: { kind: "choice", index: 0 }, q2: { kind: "multiChoice", optionIds: ["o1", "o2"] } });
    // the review shows the learner's own choice by option text (never «لم تُجب» for an answered registered question)
    const row = (await screen.findByText("أي البروتوكولات في طبقة النقل؟", { selector: ".learning-training-review-text" })).closest("li") as HTMLElement;
    expect(row.textContent).toContain("TCP · UDP");
    expect(row.textContent).not.toContain("لم تُجب");
  });

  it("unchecking every option leaves the question unanswered again (submission waits)", async () => {
    const client = { list: vi.fn(), load: vi.fn(async () => loaded()), submit: vi.fn() } as unknown as TrainingClient;
    render(<LearningTrainingRunner trainingId="T01" actor="student" client={client} onExit={() => {}} />);
    await screen.findByText("ما أكبر مثال على WAN؟");
    fireEvent.click(within(screen.getByText("ما أكبر مثال على WAN؟").closest(".iex-q") as HTMLElement).getAllByRole("radio")[0]);
    const boxes = within(await screen.findByRole("group", { name: /أي البروتوكولات/ })).getAllByRole("checkbox");
    fireEvent.click(boxes[2]);
    expect((screen.getByRole("button", { name: "أرسل الإجابات" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(boxes[2]);
    expect(screen.getByText(/أسئلة مُجابة/).textContent).toContain("1 / 2");
    expect((screen.getByRole("button", { name: "أرسل الإجابات" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
