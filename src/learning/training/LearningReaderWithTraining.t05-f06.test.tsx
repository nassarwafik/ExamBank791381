// @vitest-environment happy-dom
// Learning Practice — return behaviour (G) on the six book review pages, over the REAL 791381 content and the shared
// Reader-plus-training host: Reader position 98 (791381-m16-l05-p01, PDF 106) lists T05–T12 as ONE card per real
// library id under the book's visual groups; an available card shows the canonical code, the host-supplied title and
// the best result; an unavailable card shows only code + printed label with a disabled CTA (no title). Opening a card
// swaps the Reader for the shared runner and returning remounts the Reader on the SAME page (never page 1).
// Reader position 215 (791381-m06-l02-p02, PDF 229) does the same for F01–F06 under «امتحانات نهائية للتدريب».
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningReaderWithTraining from "./LearningReaderWithTraining";
import { createRestrictedReaderContentApi } from "../reader/restrictedContentApi";
import type { TrainingClient, TrainingListEntry, TrainingLoadResponse, TrainingSubmitResponse } from "./types";
import type { Question } from "../../StudentQuestionCard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const SLOW = { timeout: 8000 }, T = 30000;
const P98 = "791381-m16-l05-p01", P215 = "791381-m06-l02-p02";
const jump = () => screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement;
const goTo = async (id: string) => { fireEvent.change(jump(), { target: { value: id } }); await waitFor(() => expect(jump().value).toBe(id)); };

const meta = (id: string, order: number, label: string, mod: string, extra: Partial<TrainingListEntry> = {}): TrainingListEntry =>
  ({ trainingId: id, order, label, requiredModuleId: mod, courseId: "791381", available: false, ...extra });
const BEST = { bestPercentage: 60, bestPoints: 15, maxPoints: 25, attempts: 1, lastCompletedAt: null };
// The host decides availability; the page carries only code + label + gate. T05/T06 available here, T07–T12 not.
const LIST98: TrainingListEntry[] = [
  meta("T05", 5, "تدريب 5", "791381-m08", { available: true, title: "Class وSubnet وCIDR" }),
  meta("T06", 6, "تدريب 6", "791381-m09", { available: true, title: "المجالات الخاصة والعامة", best: BEST }),
  meta("T07", 7, "تدريب 7", "791381-m10"), meta("T08", 8, "تدريب 8", "791381-m11"), meta("T09", 9, "تدريب 9", "791381-m12"),
  meta("T10", 10, "تدريب 10", "791381-m13"), meta("T11", 11, "تدريب 11", "791381-m14"), meta("T12", 12, "تدريب 12", "791381-m15"),
];
const LIST215: TrainingListEntry[] = [
  meta("F01", 31, "الامتحان الأول", "791381-m06", { available: true, title: "نموذج A — 2025" }),
  ...["الثاني", "الثالث", "الرابع", "الخامس", "السادس"].map((n, i) => meta(`F0${i + 2}`, 32 + i, "الامتحان " + n, "791381-m06")),
];
const questions = (id: string, n = 4): Question[] => Array.from({ length: n }, (_, i) => ({
  examQuestionId: `LIB-${id}-Q${String(i + 1).padStart(2, "0")}`, presentationType: "multipleChoice", marks: 25, text: `سؤال ${i + 1}`,
  options: [{ value: "0", text: "أ" }, { value: "1", text: "ب" }], answer: {}, hint: "",
} as unknown as Question));
const loaded = (entry: TrainingListEntry, title: string): TrainingLoadResponse =>
  ({ ok: true, actor: "student", training: { ...entry, title, questionCount: 4, totalMarks: 100, maxPoints: 25 }, exam: { questions: questions(entry.trainingId) } });
const graded = (id: string): TrainingSubmitResponse => ({
  ok: true, actor: "student", persisted: true,
  result: { correctCount: 4, questionCount: 4, score: 100, totalMarks: 100, percentage: 100, review: questions(id).map((q, i) => ({ questionId: q.examQuestionId!, questionNumber: i + 1, correct: true, chosenIndex: 0, correctOptionIndex: 0, hint: "" })) },
  practice: { bestPercentage: 100, bestPoints: 25, maxPoints: 25, attempts: 1, lastCompletedAt: null, improved: true, pointsGained: 25, earnedPoints: 25 },
});

function fakeClient(list: TrainingListEntry[], load: TrainingLoadResponse, submit: TrainingSubmitResponse) {
  const c = { list: vi.fn(async () => ({ ok: true as const, actor: "student" as const, trainings: list })), load: vi.fn(async () => load), submit: vi.fn(async () => submit) };
  return c as TrainingClient & typeof c;
}
function mount(client: TrainingClient, modules: string[]) {
  const api = createRestrictedReaderContentApi("791381", modules);
  const onTrainingSubmitted = vi.fn();
  render(<LearningReaderWithTraining courseId="791381" api={api} onExit={vi.fn()} exitLabel="العودة إلى موادي التعليمية" client={client} actor="student" onTrainingSubmitted={onTrainingSubmitted} />);
  return onTrainingSubmitted;
}
const code = (region: HTMLElement) => region.querySelector(".learning-reader-training-code")?.textContent;
async function solveAndReturn(cta: HTMLElement, runnerTitle: string, pageHeading: string, pageId: string, id: string, client: ReturnType<typeof fakeClient>) {
  fireEvent.click(cta);
  await screen.findByRole("heading", { level: 2, name: runnerTitle }, SLOW);           // the shared runner
  expect(document.querySelector(".learning-reader")).toBeNull();                       // the Reader is swapped out
  expect(client.load).toHaveBeenCalledWith(id);
  for (const q of questions(id)) fireEvent.click(within(screen.getByText(q.text).closest(".iex-q") as HTMLElement).getAllByRole("radio")[0]);
  fireEvent.click(screen.getByRole("button", { name: "أرسل الإجابات" }));
  await screen.findByText("مراجعة الإجابات");
  expect(client.submit).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getAllByRole("button", { name: "العودة إلى الصفحة" })[0]);
  await screen.findByRole("heading", { level: 2, name: pageHeading }, SLOW);           // SAME page, not page 1
  expect(jump().value).toBe(pageId);
  expect(document.querySelector(".learning-reader")).toBeTruthy();
  await waitFor(() => expect(client.list).toHaveBeenCalledTimes(2));                   // refreshed once on return
}

describe("Reader position 98 (791381-m16-l05-p01) — T05–T12 cards, one per library id, and the return flow", () => {
  it("shows code + host title + best result for available items, code + label + disabled CTA (no title) otherwise; opening T05 and returning lands on the same page", async () => {
    const client = fakeClient(LIST98, loaded(LIST98[0], "Class وSubnet وCIDR"), graded("T05"));
    const onTrainingSubmitted = mount(client, ["791381-m01", "791381-m02", "791381-m16"]);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await waitFor(() => expect(client.list).toHaveBeenCalledTimes(1));
    await goTo(P98);
    await screen.findByRole("heading", { level: 2, name: "تدريبات مراجعة سريعة" }, SLOW);
    await screen.findByRole("region", { name: "تدريب 5" }, SLOW);                       // the module body (lazy chunk) is in
    // content heading level n renders as h(n+1): the page title is the h2
    expect(screen.getByRole("heading", { level: 4, name: "تدريبات مرتبطة بهذه الصفحة" })).toBeTruthy();
    for (const g of ["تدريب 5–6", "تدريب 7–8", "تدريب 9–12"]) expect(screen.getByRole("heading", { level: 5, name: g })).toBeTruthy();
    const cards = Array.from({ length: 8 }, (_, i) => screen.getByRole("region", { name: "تدريب " + (i + 5) }));
    expect(cards.map(code)).toEqual(["T05", "T06", "T07", "T08", "T09", "T10", "T11", "T12"]);
    expect(within(cards[0]).getByText("Class وSubnet وCIDR")).toBeTruthy();
    expect(within(cards[0]).getByText("لم تحلّ هذا التدريب بعد.")).toBeTruthy();
    expect(within(cards[0]).getByRole("button", { name: "ابدأ التدريب" })).toBeTruthy();
    expect(within(cards[1]).getByText("المجالات الخاصة والعامة")).toBeTruthy();
    expect(within(cards[1]).getByText(/أفضل نتيجة:/).textContent).toBe("أفضل نتيجة: 60% · نقاط التقوية: 15 / 25");
    expect(within(cards[1]).getByRole("button", { name: "أعد التدريب" })).toBeTruthy();
    for (const c of cards.slice(2)) {
      expect(within(c).getByText("سيصبح متاحًا عند نشر الجزء المرتبط به.")).toBeTruthy();
      expect((within(c).getByRole("button", { name: "ابدأ التدريب" }) as HTMLButtonElement).disabled).toBe(true);
      expect(c.querySelector(".learning-reader-training-title")).toBeNull();
    }
    expect(client.list).toHaveBeenCalledTimes(1);                                       // one list read for eight cards
    expect(document.querySelectorAll('.learning-reader a[href^="http"]').length).toBe(0); // no external navigation on the page

    await solveAndReturn(within(cards[0]).getByRole("button", { name: "ابدأ التدريب" }), "Class وSubnet وCIDR", "تدريبات مراجعة سريعة", P98, "T05", client);
    expect(onTrainingSubmitted).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "تدريب 5" })).toBeTruthy();
  }, T);
});

describe("Reader position 215 (791381-m06-l02-p02) — F01–F06 under «امتحانات نهائية للتدريب» and the return flow", () => {
  it("lists the six final exams once each with their codes, opens F01 through the same runner and returns to the same page", async () => {
    const client = fakeClient(LIST215, loaded(LIST215[0], "نموذج A — 2025"), graded("F01"));
    mount(client, ["791381-m01", "791381-m02", "791381-m06"]);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await goTo(P215);
    await screen.findByRole("region", { name: "الامتحان الأول" }, SLOW);
    expect(screen.getByRole("heading", { level: 4, name: "امتحانات نهائية للتدريب" })).toBeTruthy();
    const pageHeading = "امتحانات نهائية للتدريب";
    expect(screen.getByRole("heading", { level: 2, name: pageHeading })).toBeTruthy();
    const labels = ["الامتحان الأول", "الامتحان الثاني", "الامتحان الثالث", "الامتحان الرابع", "الامتحان الخامس", "الامتحان السادس"];
    const cards = labels.map(n => screen.getByRole("region", { name: n }));
    expect(cards.map(code)).toEqual(["F01", "F02", "F03", "F04", "F05", "F06"]);
    expect(within(cards[0]).getByText("نموذج A — 2025")).toBeTruthy();
    for (const c of cards.slice(1)) {
      expect((within(c).getByRole("button", { name: "ابدأ التدريب" }) as HTMLButtonElement).disabled).toBe(true);
      expect(c.textContent).not.toMatch(/نموذج|بجروت/);
    }
    await solveAndReturn(within(cards[0]).getByRole("button", { name: "ابدأ التدريب" }), "نموذج A — 2025", pageHeading, P215, "F01", client);
    expect(screen.getByRole("region", { name: "الامتحان الأول" })).toBeTruthy();
  }, T);
});
