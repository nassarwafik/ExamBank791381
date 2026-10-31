// @vitest-environment happy-dom
// 791381s Phase 2 — REVEAL mode in the Reader (owner decision D3: «يختار الطالب، يظهر الخطأ بالأحمر والصحيح بالأخضر مع شرح بسيط»)
// and the «تدريبات الوحدة» page (layout "practice"): nothing of the key before an answer; after it the question locks, the chosen
// wrong option is marked «إجابتك» (red), the right one «الإجابة الصحيحة» (green), the explanation shows for right AND wrong; a
// served block takes the right answer from the server's reply; a right answer after a shown answer says it earns nothing (and
// the local path never reports it); the practice page keeps a running score and «أعد كل الأسئلة». Then the real m01 page.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import PracticeBlockView from "./PracticeBlockView";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import { loadBundledModuleContent } from "../content/bundledModules";
import { servedBlock } from "../study/checkIndex";
import type { StudyAttemptResponse, StudyHost, StudyResponse } from "../study/types";
import type { ContentPage, PracticeQuestion } from "../content/types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const MC: PracticeQuestion = {
  kind: "multipleChoice", prompt: "ما أكبر مثال على WAN؟",
  options: [{ id: "a", text: "غرفة الحاسوب" }, { id: "b", text: "الإنترنت", correct: true }, { id: "c", text: "شبكة البيت" }],
  feedback: { explanation: "أكبر مثال على WAN هو الإنترنت." },
};
const TF: PracticeQuestion = { kind: "trueFalse", prompt: "بناء الشبكة هو النهاية.", answer: false, feedback: { explanation: "بناء الشبكة ليس النهاية." } };
const reply = (over: Partial<StudyAttemptResponse> = {}): StudyAttemptResponse => ({ ok: true, actor: "student", correct: false, persisted: false, alreadyCompleted: false, gained: 0, study: true, page: { pageId: "p1", moduleId: "m1", completed: [], eligible: 2 }, module: { completed: 0, eligible: 2, points: 0, max: 20 }, totalPoints: 0, ...over });
function host(impl: (pageId: string, activityId: string, r: StudyResponse) => Promise<StudyAttemptResponse>) {
  const report = vi.fn(impl);
  return { pageStatus: () => ({ kind: "ready", completed: new Set<string>(), eligible: 2, module: null }), report } as StudyHost & { report: typeof report };
}
const option = (name: RegExp) => screen.getByRole("radio", { name });

describe("reveal mode — an authored question (local key)", () => {
  it("before an answer nothing of the key is in the DOM; after a WRONG answer: locked, «إجابتك» red, «الإجابة الصحيحة» green, the explanation", () => {
    const { container } = render(<PracticeBlockView question={MC} activityId="q1" reveal />);
    expect(container.querySelector(".learning-reader-practice-revealtag, .is-answer")).toBeNull();
    expect(container.textContent).not.toContain(MC.feedback!.explanation!);

    fireEvent.click(option(/غرفة الحاسوب/));
    const picked = option(/غرفة الحاسوب/), answer = option(/الإنترنت/);
    expect(picked.className).toContain("is-picked");
    expect(picked.className).toContain("is-wrong");
    expect(picked.textContent).toContain("إجابتك");
    expect(answer.className).toContain("is-answer");
    expect(answer.textContent).toContain("الإجابة الصحيحة");
    expect(screen.getByRole("status").textContent).toContain("✕ إجابة خاطئة — الإجابة الصحيحة: الإنترنت");
    expect(screen.getByText(MC.feedback!.explanation!)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /تلميح/ })).toBeNull();          // no hint ladder in reveal mode
    for (const r of screen.getAllByRole("radio")) expect(r.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(option(/الإنترنت/));                                         // locked: a click changes nothing
    expect(option(/غرفة الحاسوب/).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "أعد السؤال" }));
    expect(container.querySelector(".is-answer, .is-picked")).toBeNull();
    expect(container.textContent).not.toContain(MC.feedback!.explanation!);
  });

  it("a RIGHT answer: ✓ صحيح, the option marked «الإجابة الصحيحة», the explanation shown", () => {
    render(<PracticeBlockView question={TF} activityId="q2" reveal />);
    fireEvent.click(option(/خطأ/));
    expect(screen.getByRole("status").textContent).toContain("✓ صحيح");
    expect(option(/خطأ/).className).toContain("is-answer");
    expect(option(/خطأ/).textContent).toContain("الإجابة الصحيحة");
    expect(screen.getByText(TF.feedback!.explanation!)).toBeTruthy();
  });

  it("anti-farming on the local path: after a shown answer, a later right answer is never reported", async () => {
    const h = host(async () => reply({ correct: true, persisted: true, gained: 10 }));
    render(<PracticeBlockView question={TF} activityId="q2" pageId="p1" study={h} reveal />);
    fireEvent.click(option(/صح/));                                               // wrong → the answer is shown
    fireEvent.click(screen.getByRole("button", { name: "أعد السؤال" }));
    fireEvent.click(option(/خطأ/));                                              // right, after the reveal
    await Promise.resolve();
    expect(h.report).not.toHaveBeenCalled();
  });

  it("without reveal the established behaviour is unchanged (no right answer shown after a wrong one, hint ladder offered)", () => {
    const { container } = render(<PracticeBlockView question={{ ...MC, feedback: { ...MC.feedback, hints: ["فكّر في الحجم"] } }} activityId="q1" />);
    fireEvent.click(option(/غرفة الحاسوب/));
    expect(screen.getByText(/✕ غير صحيح — حاول مرة أخرى/)).toBeTruthy();
    expect(container.querySelector(".is-answer")).toBeNull();
    expect(container.textContent).not.toContain(MC.feedback!.explanation!);
    expect(screen.getByRole("button", { name: "ماذا أفحص؟ (تلميح)" })).toBeTruthy();
  });
});

describe("reveal mode — a served question (the server sends the right answer with the verdict)", () => {
  const served = servedBlock({ id: "q1", type: "practice", origin: "teacher-enrichment", reveal: true, question: MC });
  const q = (served as Extract<typeof served, { type: "practice" }>).question;

  it("the served block keeps the reveal flag and nothing of the key", () => {
    expect(served).toMatchObject({ reveal: true, serverCheck: true });
    expect(JSON.stringify(served)).not.toMatch(/correct|explanation|feedback/);
  });

  it("a wrong answer shows the server's right answer and explanation", async () => {
    const h = host(async () => reply({ reveal: { kind: "multipleChoice", optionIds: ["b"] }, feedback: { explanation: "شرح الخادم" } }));
    render(<PracticeBlockView question={q} activityId="q1" pageId="p1" study={h} serverCheck reveal />);
    fireEvent.click(option(/شبكة البيت/));
    await screen.findByText("شرح الخادم");
    expect(h.report).toHaveBeenCalledWith("p1", "q1", { kind: "multipleChoice", optionId: "c" });
    expect(option(/الإنترنت/).className).toContain("is-answer");
    expect(option(/شبكة البيت/).textContent).toContain("إجابتك");
  });

  it("a right answer after a shown answer: the server says revealedBefore → «لا تُحسب له نقاط قوة», no «+n» line", async () => {
    const h = host(async () => reply({ correct: true, revealedBefore: true, reveal: { kind: "multipleChoice", optionIds: ["b"] }, feedback: { explanation: "شرح" } }));
    render(<PracticeBlockView question={q} activityId="q1" pageId="p1" study={h} serverCheck reveal />);
    fireEvent.click(option(/الإنترنت/));
    await screen.findByText(/لا تُحسب له نقاط قوة/);
    expect(screen.queryByText(/نقطة قوة —/)).toBeNull();
  });
});

describe("«تدريبات الوحدة» — the practice page", () => {
  const page: ContentPage = {
    id: "c-m01-l02-p01", title: "تدريبات الوحدة", order: 1, layout: "practice", source: { kind: "book", sourceId: "c", pdfPageStart: 4 },
    blocks: [
      { id: "m01-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true, question: MC },
      { id: "m01-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true, question: TF },
    ],
  };
  const header: ReaderPageHeader = { courseId: "c", pageTitle: page.title, moduleTitle: "الوحدة", lessonTitle: "تدريبات الوحدة", position: { index: 1, total: 1 }, source: page.source };

  it("a running score, the result when every question is answered, and «أعد كل الأسئلة» empties them; the badge says it is not book content", () => {
    const { container } = render(<LearningPageRenderer header={header} body={{ kind: "ready", page }} />);
    expect(screen.getByText("تدريبات تفاعلية")).toBeTruthy();
    expect(screen.queryByText("من الكتاب")).toBeNull();
    const score = () => container.querySelector(".learning-unit-practice-score")!.textContent;
    expect(score()).toContain("أجبت عن 0 من 2");
    fireEvent.click(option(/غرفة الحاسوب/));                                     // wrong
    expect(score()).toContain("أجبت عن 1 من 2 · الصحيحة: 0");
    fireEvent.click(screen.getByRole("radio", { name: "خطأ" }));                 // right
    expect(score()).toContain("نتيجتك: 1 / 2");
    fireEvent.click(within(container.querySelector(".learning-unit-practice-score") as HTMLElement).getByRole("button", { name: "أعد كل الأسئلة" }));
    expect(score()).toContain("أجبت عن 0 من 2");
    expect(container.querySelector(".is-answer, .is-picked")).toBeNull();
  });

  it("the real 791381s m01 page: ten reveal questions under the booklet skin, every one answerable", async () => {
    const mod = await loadBundledModuleContent("791381s", "791381s-m01");
    const real = mod.lessons.flatMap(l => l.pages).find(p => p.id === "791381s-m01-l02-p01")!;
    expect(real.layout).toBe("practice");
    const { container } = render(<LearningPageRenderer header={{ ...header, courseId: "791381s", pageTitle: real.title, source: real.source }} body={{ kind: "ready", page: real }} />);
    expect(container.querySelectorAll(".learning-reader-practice.is-interactive")).toHaveLength(10);
    expect(container.querySelector(".learning-unit-practice-score")!.textContent).toContain("أجبت عن 0 من 10");
  }, 30000);
});
