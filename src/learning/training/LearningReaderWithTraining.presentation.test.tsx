// @vitest-environment happy-dom
// Presentation mode × Learning Practice / CLI — on the REAL 791381 content:
//  14. a training opened from the presentation view returns to the SAME page AND the same mode (the host remembers
//      both, exactly like the page); the runner itself is the shared runner, unchanged;
//  16. the CLI terminal line is an input: arrows / F / Escape typed there never navigate or leave presentation, and
//      the command semantics are untouched;
//  17. Learning Practice cards, availability and the best-result display are the same in both modes.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningReaderWithTraining from "./LearningReaderWithTraining";
import LearningReader from "../reader/LearningReader";
import { createRestrictedReaderContentApi } from "../reader/restrictedContentApi";
import type { TrainingClient, TrainingListEntry, TrainingLoadResponse, TrainingSubmitResponse } from "./types";
import type { Question } from "../../StudentQuestionCard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ""; });
const SLOW = { timeout: 8000 }, T = 30000;
const P08 = "791381-m02-l01-p08";
const CLI_PAGE = "791381-m22-l02-p01";
const jump = () => screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement;
const goTo = async (id: string) => { fireEvent.change(jump(), { target: { value: id } }); await waitFor(() => expect(jump().value).toBe(id)); };
const root = () => document.querySelector(".learning-reader") as HTMLElement;
const pageField = () => screen.getByLabelText("رقم الصفحة") as HTMLInputElement;

const meta = (id: string, order: number, mod: string, extra: Partial<TrainingListEntry> = {}): TrainingListEntry =>
  ({ trainingId: id, order, label: "تدريب " + order, requiredModuleId: mod, courseId: "791381", available: false, strengthEligible: true, ...extra });
const LIST: TrainingListEntry[] = [
  meta("T01", 1, "791381-m01", { available: true, title: "أساسيات الشبكات" }),
  meta("T02", 2, "791381-m02", { available: true, title: "أنظمة العد", best: { bestPercentage: 60, bestPoints: 15, maxPoints: 25, attempts: 1, lastCompletedAt: null } }),
  meta("T03", 3, "791381-m07"), meta("T04", 4, "791381-m07"),
];
const questions: Question[] = Array.from({ length: 3 }, (_, i) => ({
  examQuestionId: `LIB-T01-Q${i + 1}`, presentationType: "multipleChoice", marks: 10, text: `سؤال ${i + 1}`,
  options: [{ value: "0", text: "أ" }, { value: "1", text: "ب" }], answer: {}, hint: "",
} as unknown as Question));
const LOADED: TrainingLoadResponse = { ok: true, actor: "student", training: { ...LIST[0], title: "أساسيات الشبكات", questionCount: 3, totalMarks: 30, maxPoints: 25 }, exam: { questions } };
const GRADED: TrainingSubmitResponse = { ok: true, actor: "student", persisted: true, result: { correctCount: 3, questionCount: 3, score: 30, totalMarks: 30, percentage: 100, review: questions.map((q, i) => ({ questionId: q.examQuestionId!, questionNumber: i + 1, correct: true, chosenIndex: 0, correctOptionIndex: 0, hint: "" })) }, practice: { bestPercentage: 100, bestPoints: 25, maxPoints: 25, attempts: 1, lastCompletedAt: null, improved: true, pointsGained: 25, earnedPoints: 25 } };
function fakeClient() {
  const c = { list: vi.fn(async () => ({ ok: true as const, actor: "student" as const, trainings: LIST })), load: vi.fn(async () => LOADED), submit: vi.fn(async () => GRADED) };
  return c as TrainingClient & typeof c;
}

describe("14 · return from a training preserves the page AND presentation mode", () => {
  it("presentation → open T01 → shared runner (normal layout) → return → the Reader is back on PDF 22 in presentation; cards and best results unchanged", async () => {
    const client = fakeClient();
    const api = createRestrictedReaderContentApi("791381", ["791381-m01", "791381-m02"]);
    render(<LearningReaderWithTraining courseId="791381" api={api} onExit={vi.fn()} exitLabel="العودة إلى موادي التعليمية" client={client} actor="student" />);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await goTo(P08);
    await screen.findByRole("region", { name: "تدريب 1" }, SLOW);
    fireEvent.click(screen.getByRole("button", { name: "وضع العرض" }));
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(true));
    expect(pageField().value).toBe("16");                                               // Reader ordinal of PDF 22 (m01 + m02 released)
    // the Learning-Practice cards are the same inside presentation
    const c1 = screen.getByRole("region", { name: "تدريب 1" });
    expect(within(c1).getByText("أساسيات الشبكات")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "تدريب 2" })).getByText(/أفضل نتيجة:/).textContent).toBe("أفضل نتيجة: 60% · نقاط التقوية: 15 / 25");
    expect((within(screen.getByRole("region", { name: "تدريب 3" })).getByRole("button", { name: "ابدأ التدريب" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(c1).getByRole("button", { name: "ابدأ التدريب" }));
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);   // the runner
    expect(document.querySelector(".learning-reader")).toBeNull();                      // the Reader (and its overlay) is swapped out
    expect(document.body.style.overflow).toBe("");                                      // scroll lock released with it
    expect(client.load).toHaveBeenCalledWith("T01");
    for (const q of questions) fireEvent.click(within(screen.getByText(q.text).closest(".iex-q") as HTMLElement).getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: "أرسل الإجابات" }));
    await screen.findByText("مراجعة الإجابات");
    fireEvent.click(screen.getAllByRole("button", { name: "العودة إلى الصفحة" })[0]);
    await screen.findByRole("heading", { level: 2, name: "تدريبات قصيرة" }, SLOW);      // SAME page
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(true)); // SAME mode
    expect(pageField().value).toBe("16");
    expect(document.body.style.overflow).toBe("hidden");
    await screen.findByRole("region", { name: "تدريب 1" }, SLOW);
    // leaving presentation afterwards returns the normal layout on the same page
    fireEvent.click(screen.getByRole("button", { name: "خروج من وضع العرض" }));
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(false));
    expect(jump().value).toBe(P08);
    expect(screen.getByRole("button", { name: "العودة إلى موادي التعليمية" })).toBeTruthy();
  }, T);

  it("a training opened from the NORMAL view returns to the normal view (mode is remembered, not forced)", async () => {
    const client = fakeClient();
    const api = createRestrictedReaderContentApi("791381", ["791381-m01", "791381-m02"]);
    render(<LearningReaderWithTraining courseId="791381" api={api} onExit={vi.fn()} exitLabel="العودة إلى موادي التعليمية" client={client} actor="student" />);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await goTo(P08);
    const c1 = await screen.findByRole("region", { name: "تدريب 1" }, SLOW);
    fireEvent.click(within(c1).getByRole("button", { name: "ابدأ التدريب" }));
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى الصفحة" }));
    await screen.findByRole("heading", { level: 2, name: "تدريبات قصيرة" }, SLOW);
    expect(root().classList.contains("is-presentation")).toBe(false);
    expect(jump().value).toBe(P08);
  }, T);
});

describe("16 · CLI terminal inside presentation", () => {
  it("typing in the CLI line never navigates or leaves presentation; the command semantics are unchanged", async () => {
    render(<LearningReader courseId="791381" onExit={vi.fn()} />);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await goTo(CLI_PAGE);
    const cli = await screen.findByLabelText(/^سطر الأوامر/, {}, SLOW) as HTMLInputElement;
    const title = screen.getByRole("heading", { level: 2 }).textContent;
    fireEvent.click(screen.getByRole("button", { name: "وضع العرض" }));
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(true));
    const before = pageField().value;
    cli.focus();
    for (const k of ["ArrowLeft", "ArrowRight", "PageDown", "PageUp", "f", "F"]) fireEvent.keyDown(cli, { key: k, code: k.length === 1 ? "KeyF" : k });
    await waitFor(() => {});
    expect(root().classList.contains("is-presentation")).toBe(true);
    expect(pageField().value).toBe(before);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(title);
    // the simulator still parses commands exactly as before (mode change on `enable`)
    fireEvent.change(cli, { target: { value: "enable" } });
    fireEvent.keyDown(cli, { key: "Enter" });
    await waitFor(() => expect((screen.getByLabelText(/^سطر الأوامر/) as HTMLInputElement).getAttribute("aria-label")).toMatch(/الوضع الحالي/));
    expect(document.body.textContent).toContain("enable");
    expect(root().classList.contains("is-presentation")).toBe(true);
  }, T);
});
