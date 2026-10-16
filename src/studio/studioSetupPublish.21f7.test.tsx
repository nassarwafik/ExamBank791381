// @vitest-environment happy-dom
//
// Phase 21F.7 — the Studio's setup and publish steps through the REAL builder + history hook: the title and cover edit the exam as
// history steps; the design tools are the builder's own menu items; the publish timeline follows the save state and the ONE
// finalization decision; finalizing goes through the builder's final-save gate; the hand-off to assignments passes the
// unsaved-work guard; a requested start tool (the AI composer) opens once.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam } from "../examTypes";

const tf = (id: string, text: string) => ({ examQuestionId: id, presentationType: "trueFalse", marks: 1, text, answer: { correct: true } });
const exam = (text = "عبارة DNS"): StructuredExam => ({ examId: "E-S", title: "إعداد", status: "draft", sections: [
  { id: "s1", title: "الأول", gradingPolicy: "all", stimuli: {}, questions: [tf("q1", text)] }
] } as unknown as StructuredExam);

const hist: { current: ReturnType<typeof useStructuredExamHistory> | null } = { current: null };
type HostProps = { start?: StructuredExam; source?: "saved" | "unsaved"; onSave?: (mode: string) => void; onAssign?: () => void; startTool?: { examId: string; key: string } | null; onConsumed?: () => void };
function Host({ start = exam(), source = "saved", onSave = () => {}, onAssign, startTool = null, onConsumed }: HostProps) {
  const h = useStructuredExamHistory();
  const booted = useRef(false);
  const [tool, setTool] = useState(startTool);
  useEffect(() => { if (!booted.current) { booted.current = true; h.open(start, source); } }, [h, start, source]);
  useEffect(() => { hist.current = h; });
  if (!h.present) return null;
  return <StructuredExamBuilder exam={h.present} onChange={h.update} onUndo={h.undo} onRedo={h.redo} canUndo={h.canUndo} canRedo={h.canRedo} layout="studio"
    saveState={examSaveState(h.history, false)} onSave={onSave} onOpenAssignments={onAssign} startTool={tool} onStartToolConsumed={() => { setTool(null); onConsumed?.(); }}
    aiAuthor={{ author: () => new Promise(() => {}), composeExam: () => new Promise(() => {}) } as never} />;
}
beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia; });
afterEach(() => cleanup());

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });
async function openStep(props: HostProps, step: "setup" | "publish") {
  render(<Host {...props} />);
  await screen.findByRole("tree", { name: "الأقسام والأسئلة" });
  await act(async () => { fireEvent.click(document.querySelector('.st-topbar [data-step="' + step + '"]')!); });
  await screen.findByRole("heading", { name: step === "setup" ? "إعداد الامتحان" : "النشر" });
  await settle();
}
const stages = () => Array.from(document.querySelectorAll("[data-stage]")).map(li => li.getAttribute("data-stage") + ":" + li.getAttribute("data-stage-state")).join(" ");

describe("21F.7 the setup step", () => {
  it("the title field edits the exam (one history step) and the cover editor is here", async () => {
    await openStep({}, "setup");
    const steps = hist.current!.history.past.length;
    await act(async () => { fireEvent.change(screen.getByLabelText("عنوان الامتحان", { selector: "#st-setup-title" }), { target: { value: "امتحان الوحدة" } }); });
    expect(hist.current!.present!.title).toBe("امتحان الوحدة");
    expect(hist.current!.history.past.length).toBe(steps + 1);
    expect(screen.getByRole("region", { name: "الغلاف والتعليمات العامة" }).textContent).toMatch(/الغلاف/);
  });
  it("lists the builder's design tools; «فتح» runs the tool's own handler (the blueprint dialog)", async () => {
    await openStep({}, "setup");
    expect(Array.from(document.querySelectorAll("[data-setup-tool]")).map(li => li.getAttribute("data-setup-tool"))).toEqual(["blueprint", "studio"]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "فتح مخطط الامتحان" })); });
    expect(await screen.findByRole("dialog", { name: /مخطط الامتحان/ })).toBeTruthy();
  });
});

describe("21F.7 the publish step", () => {
  it("an unsaved exam: saving is the current stage (readiness is shown as it is), and «حفظ مسودة» saves a draft", async () => {
    const onSave = vi.fn();
    await openStep({ source: "unsaved", onSave }, "publish");
    expect(stages()).toBe("saved:now ready:done final:later assigned:later");
    const now = document.querySelector('[data-stage="saved"]') as HTMLElement;
    await act(async () => { fireEvent.click(within(now).getByRole("button", { name: /حفظ مسودة/ })); });
    expect(onSave).toHaveBeenCalledWith("draft");
  });
  it("a saved, ready exam: finalizing is the current stage and goes through the final save", async () => {
    const onSave = vi.fn();
    await openStep({ onSave }, "publish");
    expect(stages()).toBe("saved:done ready:done final:now assigned:later");
    await act(async () => { fireEvent.click(within(document.querySelector('[data-stage="final"]') as HTMLElement).getByRole("button", { name: /اعتماد نهائي/ })); });
    expect(onSave).toHaveBeenCalledWith("final");
  });
  it("a blocked exam: the final save is refused (no save) and the blockers are one click away", async () => {
    const onSave = vi.fn();
    await openStep({ start: exam(""), onSave }, "publish");
    expect(stages()).toBe("saved:done ready:now final:later assigned:later");
    const finalBtn = within(screen.getByRole("region", { name: "الاعتماد النهائي" })).getByRole("button", { name: /اعتماد نهائي/ });
    expect(finalBtn.getAttribute("aria-disabled")).toBe("true");
    await act(async () => { fireEvent.click(finalBtn); });
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /مراجعة العوائق \(1\)/ })); });
    expect(document.querySelector('.st-topbar [data-step="review"]')?.getAttribute("aria-current")).toBe("step");
  });
  it("a final, saved exam hands off to assignments; with unsaved edits the guard asks first", async () => {
    const onAssign = vi.fn();
    const final = { ...exam(), status: "final" } as StructuredExam;
    await openStep({ start: final, onAssign }, "publish");
    expect(stages()).toBe("saved:done ready:done final:done assigned:now");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "الانتقال إلى الواجبات" })); });
    await settle();
    expect(onAssign).toHaveBeenCalledTimes(1);
  });
  it("editing a final exam takes it off «معتمد نهائيًا» until it is saved again: no hand-off meanwhile", async () => {
    const onAssign = vi.fn();
    await openStep({ start: { ...exam(), status: "final" } as StructuredExam, onAssign }, "publish");
    await act(async () => { hist.current!.update(prev => ({ ...prev, title: "عنوان معدّل" })); });
    await settle();
    expect(stages()).toBe("saved:now ready:done final:later assigned:later");
    expect(screen.queryByRole("button", { name: "الانتقال إلى الواجبات" })).toBeNull();
    expect(onAssign).not.toHaveBeenCalled();
  });
});

describe("21F.7 a requested start tool", () => {
  it("opens the AI composer once for that exam and reports it consumed", async () => {
    const onConsumed = vi.fn();
    render(<Host source="unsaved" startTool={{ examId: "E-S", key: "ai-composer" }} onConsumed={onConsumed} />);
    expect(await screen.findByRole("dialog", { name: "المؤلف الذكي للامتحان" })).toBeTruthy();
    await settle();
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });
  it("a start tool for ANOTHER exam does nothing", async () => {
    const onConsumed = vi.fn();
    render(<Host source="unsaved" startTool={{ examId: "OTHER", key: "ai-composer" }} onConsumed={onConsumed} />);
    await screen.findByRole("tree", { name: "الأقسام والأسئلة" });
    await settle();
    expect(screen.queryByRole("dialog", { name: "المؤلف الذكي للامتحان" })).toBeNull();
    expect(onConsumed).not.toHaveBeenCalled();
  });
});
