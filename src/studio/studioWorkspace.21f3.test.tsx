// @vitest-environment happy-dom
//
// Phase 21F.3 / 21F.4 — the Exam Studio layout of the REAL StructuredExamBuilder with the REAL history hook: the outline (every
// question with its marks and issue state, an ARIA tree), the canvas (collapsed student-view cards, ONE active editor), the
// inspector (question settings and section settings), and the builder rules it must keep (one history step per edit, the deletion
// «تراجع», issue state, the classic layout untouched).
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { readBuilderLayout, writeBuilderLayout, STUDIO_LAYOUT_KEY, DEFAULT_BUILDER_LAYOUT } from "./studioPreference";
import type { StructuredExam } from "../examTypes";

const mcq = (id: string, text: string, c: number) => ({ examQuestionId: id, presentationType: "multipleChoice", marks: 2, text, options: [{ text: "المبدّل" }, { text: "الموجّه" }, { text: "المكرّر" }], answer: { correctOptionIndex: c } });
const exam = (): StructuredExam => ({ examId: "E-ST", title: "امتحان الشبكات", status: "draft", sections: [
  { id: "s1", title: "اختيار من متعدد", gradingPolicy: "all", stimuli: {}, instructions: "اختر الإجابة الصحيحة.", questions: [mcq("q1", "أي جهاز يربط بين شبكتين؟", 1), mcq("q2", "ما وظيفة DNS؟", 0)] },
  { id: "s2", title: "صواب أو خطأ", gradingPolicy: "all", stimuli: {}, questions: [
    { examQuestionId: "q3", presentationType: "trueFalse", marks: 1, text: "DHCP يوزّع العناوين.", answer: { correct: true } },
    { examQuestionId: "q4", presentationType: "shortAnswer", marks: 3, text: "", answer: { text: "" } }] }
] } as unknown as StructuredExam);

const hist: { current: ReturnType<typeof useStructuredExamHistory> | null } = { current: null };
const layoutCalls: string[] = [];
function Host({ layout = "studio" as "studio" | "classic" }) {
  const h = useStructuredExamHistory();
  const [mode, setMode] = useState(layout);
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; h.open(exam(), "saved"); } }, [h]);
  useEffect(() => { hist.current = h; });
  if (!h.present) return null;
  return (
    <div className="structured-builder-overlay" role="dialog" aria-modal="true" aria-labelledby="sb-builder-title">
      <StructuredExamBuilder exam={h.present} onChange={h.update} onUndo={h.undo} onRedo={h.redo} canUndo={h.canUndo} canRedo={h.canRedo} layout={mode}
        onLayoutChange={next => { layoutCalls.push(next); setMode(next); }} onSave={() => {}} undoToastMs={60000} />
    </div>
  );
}
beforeEach(() => { layoutCalls.length = 0; window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia; });
afterEach(() => cleanup());

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
async function openStudio() {
  render(<Host />);
  await screen.findByRole("navigation", { name: "خطوات العمل" });
  await screen.findByRole("tree", { name: "الأقسام والأسئلة" });
  await settle();
}

describe("21F.3 the Studio shell", () => {
  it("names the builder surface, shows the four steps (content current) and the outline with every question, its marks and state", async () => {
    await openStudio();
    expect(document.getElementById("sb-builder-title")?.textContent).toBe("استوديو الامتحان: امتحان الشبكات");
    const steps = within(screen.getByRole("navigation", { name: "خطوات العمل" })).getAllByRole("button");
    expect(steps.map(s => s.getAttribute("aria-current"))).toEqual([null, "step", null, null]);
    const rows = screen.getAllByRole("treeitem").filter(r => r.getAttribute("aria-level") === "2");
    expect(rows).toHaveLength(4);
    expect(rows[0].getAttribute("aria-label")).toBe("السؤال 1: أي جهاز يربط بين شبكتين؟، 2 علامة، سليم");
    expect(rows[3].getAttribute("aria-label")).toMatch(/سؤال بلا نص.*فيه خطأ$/);
    expect(document.querySelector(".sb-builder.st-studio")).not.toBeNull();
  });
  it("collapsed cards read like the student sees them, with the key marked; no editor is mounted until a card is opened", async () => {
    await openStudio();
    expect(document.querySelectorAll(".st-card")).toHaveLength(4);
    expect(document.querySelectorAll(".st-card.is-active")).toHaveLength(0);
    expect(document.querySelectorAll(".st-card textarea")).toHaveLength(0);
    const correct = card("q1").querySelector(".st-opt.is-correct");
    expect(correct?.textContent).toContain("الموجّه");
    expect(correct?.textContent).toContain("(الإجابة الصحيحة)");
    expect(card("q3").querySelector(".st-pill.is-correct")?.textContent).toContain("صح");
    expect(card("q4").querySelector(".st-chip.is-error")?.textContent).toBe("خطأ يمنع الاعتماد");
  });
  it("opening a card mounts its editor, moves focus to it and keeps ONE active card", async () => {
    await openStudio();
    await act(async () => { fireEvent.click(card("q2").querySelector(".st-card-cover")!); });
    await settle();
    expect(card("q2").classList.contains("is-active")).toBe(true);
    expect(document.activeElement).toBe(card("q2"));
    expect(card("q2").querySelector("textarea")?.value).toBe("ما وظيفة DNS؟");
    await act(async () => { fireEvent.click(card("q1").querySelector(".st-card-cover")!); });
    await settle();
    expect(document.querySelectorAll(".st-card.is-active")).toHaveLength(1);
    expect(card("q1").classList.contains("is-active")).toBe(true);
  });
  it("an edit in the active card is one history step and shows at once in the outline", async () => {
    await openStudio();
    await act(async () => { fireEvent.click(card("q1").querySelector(".st-card-cover")!); });
    await settle();
    const before = hist.current!.history.past.length;
    await act(async () => { fireEvent.change(card("q1").querySelector("textarea")!, { target: { value: "أي جهاز يربط بين شبكتين مختلفتين؟" } }); });
    expect(hist.current!.history.past.length).toBe(before + 1);
    const row = screen.getAllByRole("treeitem").find(r => r.dataset.outlineQuestion === "q1")!;
    expect(row.getAttribute("aria-label")).toContain("أي جهاز يربط بين شبكتين مختلفتين؟");
  });
  it("the outline is a keyboard tree: ↓ moves, Enter opens the question in the canvas", async () => {
    await openStudio();
    const items = () => screen.getAllByRole("treeitem");
    const first = items().find(r => r.tabIndex === 0)!;
    first.focus();
    await act(async () => { fireEvent.keyDown(first, { key: "ArrowDown" }); });
    expect(document.activeElement?.getAttribute("data-outline-question")).toBe("q1");
    await act(async () => { fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" }); });
    await act(async () => { fireEvent.keyDown(document.activeElement!, { key: "Enter" }); });
    await settle();
    expect(card("q2").classList.contains("is-active")).toBe(true);
    expect(items().filter(r => r.tabIndex === 0).map(r => r.dataset.outlineQuestion)).toEqual(["q2"]);
  });
  it("the search narrows the outline", async () => {
    await openStudio();
    await act(async () => { fireEvent.change(screen.getByRole("searchbox", { name: "ابحث في الأسئلة" }), { target: { value: "DNS" } }); });
    expect(screen.getAllByRole("treeitem").filter(r => r.getAttribute("aria-level") === "2").map(r => r.dataset.outlineQuestion)).toEqual(["q2"]);
  });
  it("the layout switch is in the tools menu, and the classic layout stays the component default", async () => {
    await openStudio();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "أدوات الامتحان" })); });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "العودة إلى الواجهة الكلاسيكية" })); });
    await settle();
    expect(layoutCalls).toEqual(["classic"]);
    expect(document.querySelector(".st-studio")).toBeNull();
    expect(document.querySelector(".sb-toolbar")).not.toBeNull();
  });
});

describe("21F.4 the inspector and section settings", () => {
  it("shows the active question's settings: display number, section, and the classification / media / advanced tabs", async () => {
    await openStudio();
    expect(screen.getByRole("complementary", { name: "لوحة الخصائص" }).textContent).toContain("اختر سؤالًا");
    await act(async () => { fireEvent.click(card("q3").querySelector(".st-card-cover")!); });
    await settle();
    const panel = screen.getByRole("complementary", { name: "لوحة الخصائص" });
    expect(within(panel).getAllByRole("tab").map(t => t.textContent)).toEqual(["السؤال", "التصنيف", "الوسائط", "متقدم"]);
    await act(async () => { fireEvent.change(within(panel).getByLabelText("الرقم الظاهر"), { target: { value: "٥" } }); });
    expect(hist.current!.present!.sections[1].questions[0].displayNumber).toBe("٥");
    expect(card("q3").querySelector(".st-num")?.textContent).toBe("٥");
    await act(async () => { fireEvent.change(within(panel).getByLabelText("القسم"), { target: { value: "s1" } }); });
    expect(hist.current!.present!.sections[0].questions.map(q => q.examQuestionId)).toContain("q3");
    await act(async () => { fireEvent.click(within(panel).getByRole("tab", { name: "الوسائط" })); });
    expect(panel.textContent).toMatch(/صورة|رفع/);
  });
  it("«إعدادات القسم» opens the section's settings (the same fields as the classic header) and edits the section", async () => {
    await openStudio();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "إعدادات القسم 2" })); });
    const panel = screen.getByRole("complementary", { name: "لوحة الخصائص" });
    expect(panel.textContent).toContain("إعدادات القسم 2");
    const title = panel.querySelector<HTMLInputElement>(".sb-title-input")!;
    expect(title.value).toBe("صواب أو خطأ");
    await act(async () => { fireEvent.change(title, { target: { value: "العبارات" } }); });
    expect(document.querySelector('[data-section-id="s2"] h3')?.textContent).toBe("العبارات");
    expect(panel.querySelectorAll('input[type="radio"]').length).toBe(3);
  });
  it("deleting the active question offers «تراجع» and focus goes to its neighbour card (never <body>)", async () => {
    await openStudio();
    await act(async () => { fireEvent.click(card("q1").querySelector(".st-card-cover")!); });
    await settle();
    await act(async () => { fireEvent.click(within(card("q1")).getByRole("button", { name: "حذف السؤال" })); });
    await settle();
    expect(card("q1")).toBeNull();
    expect(document.activeElement).toBe(card("q2"));
    const undo = await screen.findByRole("button", { name: "تراجع عن حذف السؤال" });
    await act(async () => { fireEvent.click(undo); });
    await settle();
    expect(card("q1")).not.toBeNull();
  });
});

describe("21F.3 the layout preference", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });
  it("defaults to the documented default, remembers the teacher's choice, and ?studio=1 / ?studio=0 override it for one visit", () => {
    expect(readBuilderLayout("")).toBe(DEFAULT_BUILDER_LAYOUT);
    writeBuilderLayout("studio");
    expect(localStorage.getItem(STUDIO_LAYOUT_KEY)).toBe("studio");
    expect(readBuilderLayout("")).toBe("studio");
    expect(readBuilderLayout("?studio=0")).toBe("classic");
    writeBuilderLayout("classic");
    expect(readBuilderLayout("?studio=1")).toBe("studio");
    localStorage.setItem(STUDIO_LAYOUT_KEY, "nonsense");
    expect(readBuilderLayout("")).toBe(DEFAULT_BUILDER_LAYOUT);
  });
});
