// @vitest-environment happy-dom
//
// Phase T12 — the «أدوات الطالب» panel is reachable from every step of the builder. The Studio opens on «المحتوى», and the panel lives
// in «الإعداد»: the «أدوات» menu item takes the teacher there and focuses the panel's heading; the setup step shows the panel as its
// own titled region (no longer folded under the cover); review and publish say what the student will find, with a way back. The
// classic workspace's «المزيد» menu reaches the same panel. Everything runs through the REAL builder + history hook.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import { MORE_MENU_LABEL } from "../builder/BuilderToolbar";
import type { StructuredExam } from "../examTypes";
import { studentToolsBuilderSummary } from "./studentToolsBuilderSummary";

const tf = (id: string) => ({ examQuestionId: id, presentationType: "trueFalse", marks: 1, text: "عبارة", answer: { correct: true } });
const exam = (studentTools?: unknown): StructuredExam => ({ examId: "E-T12", title: "أدوات", status: "draft", ...(studentTools ? { studentTools } : {}), sections: [
  { id: "s1", title: "الأول", gradingPolicy: "all", stimuli: {}, questions: [tf("q1")] }
] } as unknown as StructuredExam);
const TWO_TOOLS = { version: 1, tools: [{ id: "calculator", variant: "basic", angleUnit: "deg" }, { id: "periodicTable", showMass: true, showConfiguration: true, range: "all" }] };

function Host({ start, layout }: { start: StructuredExam; layout: "studio" | "classic" }) {
  const h = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; h.open(start, "saved"); } }, [h, start]);
  if (!h.present) return null;
  return <StructuredExamBuilder exam={h.present} onChange={h.update} onUndo={h.undo} onRedo={h.redo} canUndo={h.canUndo} canRedo={h.canRedo} layout={layout}
    saveState={examSaveState(h.history, false)} onSave={() => {}} />;
}
beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia; });
afterEach(() => cleanup());

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });
const heading = () => document.querySelector("[data-student-tools-heading]") as HTMLElement | null;
async function studio(start: StructuredExam) {
  render(<Host start={start} layout="studio" />);
  await screen.findByRole("tree", { name: "الأقسام والأسئلة" });
}
const goTo = async (step: "setup" | "review" | "publish") => {
  await act(async () => { fireEvent.click(document.querySelector('.st-topbar [data-step="' + step + '"]')!); });
  await settle();
};

describe("T12 the builder summary line", () => {
  it("no tools · tools by their start-screen names · section limits · an invalid spec", () => {
    expect(studentToolsBuilderSummary(undefined)).toEqual({ state: "none", count: 0, text: "لا توجد أدوات للطالب في هذا الامتحان." });
    expect(studentToolsBuilderSummary(TWO_TOOLS)).toEqual({ state: "on", count: 2, text: "يجد الطالب: آلة حاسبة بسيطة، الجدول الدوري." });
    const limited = studentToolsBuilderSummary({ ...TWO_TOOLS, sectionOverrides: { s1: { disabled: ["calculator"] } } });
    expect(limited.text).toBe("يجد الطالب: آلة حاسبة بسيطة، الجدول الدوري (بعضها مغلق في أقسام محددة).");
    expect(studentToolsBuilderSummary({ version: 1, tools: [{ id: "calculator", variant: "nope" }] }).state).toBe("invalid");
  });
});

describe("T12 the Studio", () => {
  it("opens on «المحتوى» without the panel; the «أدوات» item opens «الإعداد» and focuses the panel's heading", async () => {
    await studio(exam(TWO_TOOLS));
    expect(heading()).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "أدوات الامتحان" })); });
    const item = screen.getByRole("button", { name: /^أدوات الطالب/ });
    expect(item.textContent).toContain("2 مفعّلة");
    await act(async () => { fireEvent.click(item); });
    await screen.findByRole("heading", { name: "إعداد الامتحان" });
    await settle();
    expect(heading()).not.toBeNull();
    expect(document.activeElement).toBe(heading());
  });

  it("«الإعداد» shows the panel as its own region, before the cover, no longer inside it", async () => {
    await studio(exam());
    await goTo("setup");
    const own = screen.getByRole("region", { name: "أدوات الطالب أثناء الامتحان" });
    const cover = screen.getByRole("region", { name: "الغلاف والتعليمات العامة" });
    expect(within(own).getByTestId("student-tools-editor")).toBeTruthy();
    expect(within(cover).queryByTestId("student-tools-editor")).toBeNull();
    expect(own.compareDocumentPosition(cover) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the focus request is spent once: returning to «الإعداد» later does not pull focus to the panel again", async () => {
    await studio(exam());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "أدوات الامتحان" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^أدوات الطالب/ })); });
    await settle();
    expect(document.activeElement).toBe(heading());
    await goTo("review");
    await goTo("setup");
    expect(heading()).not.toBeNull();
    expect(document.activeElement).not.toBe(heading());
  });

  for (const step of ["review", "publish"] as const) {
    it("«" + (step === "review" ? "المراجعة" : "النشر") + "» says what the student will find; «تعديل أدوات الطالب» goes back to the panel", async () => {
      await studio(exam(TWO_TOOLS));
      await goTo(step);
      const panel = document.querySelector('[data-' + step + '-panel="student-tools"]') as HTMLElement;
      expect(panel.textContent).toContain("يجد الطالب: آلة حاسبة بسيطة، الجدول الدوري.");
      await act(async () => { fireEvent.click(within(panel).getByRole("button", { name: "تعديل أدوات الطالب" })); });
      await screen.findByRole("heading", { name: "إعداد الامتحان" });
      await settle();
      expect(document.activeElement).toBe(heading());
    });
  }

  it("an exam without tools says so in review (nothing is invented)", async () => {
    await studio(exam());
    await goTo("review");
    expect((document.querySelector('[data-review-panel="student-tools"]') as HTMLElement).textContent).toContain("لا توجد أدوات للطالب في هذا الامتحان.");
  });
});

describe("T12 the classic workspace", () => {
  it("«المزيد» → «أدوات الطالب» focuses the panel shown above the questions", async () => {
    render(<Host start={exam()} layout="classic" />);
    await screen.findByTestId("student-tools-editor");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: MORE_MENU_LABEL })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^أدوات الطالب/ })); });
    await settle();
    expect(document.activeElement).toBe(heading());
  });
});
