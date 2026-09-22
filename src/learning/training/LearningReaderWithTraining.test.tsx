// @vitest-environment happy-dom
// Learning Practice — the shared Reader-plus-training host over the REAL 791381 registry (restricted to m01+m02):
// the PDF-22 page shows the four trainings with host-decided states (T01/T02 available with titles, T03/T04 only
// the printed label + availability note), opening one swaps the Reader for the shared runner, solving reports the
// submission to the host, and returning remounts the Reader on the SAME page (never page 1). The availability list
// is read once per mount and once more after a training closes — never per block.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningReaderWithTraining from "./LearningReaderWithTraining";
import { createRestrictedReaderContentApi } from "../reader/restrictedContentApi";
import type { TrainingClient, TrainingListEntry, TrainingLoadResponse, TrainingSubmitResponse } from "./types";
import type { Question } from "../../StudentQuestionCard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const SLOW = { timeout: 8000 }, T = 30000;
const P08 = "791381-m02-l01-p08";
const jump = () => screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement;
const goTo = async (id: string) => { fireEvent.change(jump(), { target: { value: id } }); await waitFor(() => expect(jump().value).toBe(id)); };

const meta = (id: string, order: number, mod: string, extra: Partial<TrainingListEntry> = {}): TrainingListEntry =>
  ({ trainingId: id, order, label: "تدريب " + order, requiredModuleId: mod, courseId: "791381", available: false, ...extra });
const LIST: TrainingListEntry[] = [
  meta("T01", 1, "791381-m01", { available: true, title: "أساسيات الشبكات" }),
  meta("T02", 2, "791381-m02", { available: true, title: "أنظمة العد", best: { bestPercentage: 60, bestPoints: 24, maxPoints: 40, attempts: 1, lastCompletedAt: null } }),
  meta("T03", 3, "791381-m07"),
  meta("T04", 4, "791381-m07"),
];
const questions: Question[] = Array.from({ length: 10 }, (_, i) => ({
  examQuestionId: `LIB-T02-Q${String(i + 1).padStart(2, "0")}`, presentationType: "multipleChoice", marks: 10, text: `سؤال ${i + 1}`,
  options: [{ value: "0", text: "أ" }, { value: "1", text: "ب" }], answer: {}, hint: "",
} as unknown as Question));
const LOADED: TrainingLoadResponse = { ok: true, actor: "student", training: { ...LIST[1], title: "أنظمة العد", questionCount: 10, totalMarks: 100, maxPoints: 40 }, exam: { questions } };
const GRADED: TrainingSubmitResponse = { ok: true, actor: "student", persisted: true, result: { correctCount: 10, questionCount: 10, score: 100, totalMarks: 100, percentage: 100, review: questions.map((q, i) => ({ questionId: q.examQuestionId!, questionNumber: i + 1, correct: true, chosenIndex: 0, correctOptionIndex: 0, hint: "" })) }, practice: { bestPercentage: 100, bestPoints: 40, maxPoints: 40, attempts: 2, lastCompletedAt: null, improved: true, pointsGained: 16, earnedPoints: 40 } };

function fakeClient(listImpl?: () => Promise<{ ok: true; actor: "student"; trainings: TrainingListEntry[] }>) {
  const list = vi.fn(listImpl ?? (async () => ({ ok: true as const, actor: "student" as const, trainings: LIST })));
  const load = vi.fn(async () => LOADED);
  const submit = vi.fn(async () => GRADED);
  return { list, load, submit } as TrainingClient & { list: typeof list; load: typeof load; submit: typeof submit };
}
function mount(client: TrainingClient | null, onTrainingSubmitted = vi.fn()) {
  const api = createRestrictedReaderContentApi("791381", ["791381-m01", "791381-m02"]);
  const utils = render(<LearningReaderWithTraining courseId="791381" api={api} onExit={vi.fn()} exitLabel="العودة إلى موادي التعليمية" client={client} actor="student" onTrainingSubmitted={onTrainingSubmitted} />);
  return { ...utils, onTrainingSubmitted };
}

describe("Reader-plus-training host — the PDF-22 page and the return flow", () => {
  it("shows host-decided cards on PDF 22, opens T02 in the shared runner, reports the submission and returns to the SAME page", async () => {
    const client = fakeClient();
    const { onTrainingSubmitted } = mount(client);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await waitFor(() => expect(client.list).toHaveBeenCalledTimes(1));
    await goTo(P08);
    await screen.findByRole("heading", { level: 2, name: "تدريبات قصيرة" }, SLOW);
    await screen.findByRole("region", { name: "تدريب 1" }, SLOW);                   // the module body (lazy chunk) is in
    const cards = ["تدريب 1", "تدريب 2", "تدريب 3", "تدريب 4"].map(n => screen.getByRole("region", { name: n }));
    expect(within(cards[0]).getByText("أساسيات الشبكات")).toBeTruthy();
    expect(within(cards[0]).getByRole("button", { name: "ابدأ التدريب" })).toBeTruthy();
    expect(within(cards[1]).getByText("أنظمة العد")).toBeTruthy();
    expect(within(cards[1]).getByText(/أفضل نتيجة:/).textContent).toBe("أفضل نتيجة: 60% · نقاط القوة: 24 / 40");
    for (const c of [cards[2], cards[3]]) {
      expect(within(c).getByText("سيصبح متاحًا عند نشر الجزء المرتبط به.")).toBeTruthy();
      expect((within(c).getByRole("button", { name: "ابدأ التدريب" }) as HTMLButtonElement).disabled).toBe(true);
      expect(c.textContent).not.toMatch(/IPv4|الخاصة والعامة/);
    }
    expect(client.list).toHaveBeenCalledTimes(1);                                   // one list read for four cards

    fireEvent.click(within(cards[1]).getByRole("button", { name: "أعد التدريب" }));
    await screen.findByRole("heading", { level: 2, name: "أنظمة العد" }, SLOW);      // the runner
    expect(document.querySelector(".learning-reader")).toBeNull();                  // the Reader is swapped out
    expect(client.load).toHaveBeenCalledWith("T02");
    for (const q of questions) fireEvent.click(within(screen.getByText(q.text).closest(".iex-q") as HTMLElement).getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: "أرسل الإجابات" }));
    await screen.findByText("مراجعة الإجابات");
    expect(onTrainingSubmitted).toHaveBeenCalledTimes(1);
    expect(screen.getByText("40 / 40").closest("dd")!.textContent).toBe("40 / 40 نقاط قوة");
    expect(screen.getByText("+16").closest("dd")!.textContent).toBe("+16 نقاط قوة");

    fireEvent.click(screen.getAllByRole("button", { name: "العودة إلى الصفحة" })[0]);
    await screen.findByRole("heading", { level: 2, name: "تدريبات قصيرة" }, SLOW);   // SAME page, not page 1
    expect(jump().value).toBe(P08);
    expect(document.querySelector(".learning-reader")).toBeTruthy();
    await waitFor(() => expect(client.list).toHaveBeenCalledTimes(2));              // refreshed once on return
    expect(screen.getByRole("button", { name: "العودة إلى موادي التعليمية" })).toBeTruthy();
  }, T);

  it("no client (no session) → generic cards, no CTA, no training request; the Reader is otherwise unchanged", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mount(null);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await goTo(P08);
    await screen.findByRole("heading", { level: 2, name: "تدريبات قصيرة" }, SLOW);
    const c = await screen.findByRole("region", { name: "تدريب 2" }, SLOW);
    expect(within(c).getByText("يُحلّ هذا التدريب تفاعليًا من داخل المنصة.")).toBeTruthy();
    expect(within(c).queryByRole("button")).toBeNull();
    expect(c.textContent).not.toContain("أنظمة العد");
    expect(fetchSpy).not.toHaveBeenCalled();
  }, T);

  it("a failed list read degrades to an error note with retry (one more list read), never a crash or a leaked title", async () => {
    let calls = 0;
    const client = fakeClient(async () => { calls += 1; if (calls === 1) throw new Error("x"); return { ok: true as const, actor: "student" as const, trainings: LIST }; });
    mount(client);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await goTo(P08);
    const c = await screen.findByRole("region", { name: "تدريب 2" }, SLOW);
    await within(c).findByText(/تعذّر التحقق من إتاحة التدريب/);
    expect(c.textContent).not.toContain("أنظمة العد");
    fireEvent.click(within(c).getByRole("button", { name: "إعادة المحاولة" }));
    await within(c).findByText("أنظمة العد");
    expect(client.list).toHaveBeenCalledTimes(2);
  }, T);
});
