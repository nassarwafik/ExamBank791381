// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam, BuilderQuestion } from "./examTypes";
import { networkingBlueprint } from "./assessmentBlueprintFixtures";

// Phase 13C-A — Independent Review Fix 1 (builder surface): R1 context identities authored with stable ids; R4 section
// constraints validated against the REAL exam sections in the builder. Fail-first on dec6ce2.

const mcq = (id: string, text: string): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } } as BuilderQuestion);
const makeExam = (over: Partial<StructuredExam> = {}): StructuredExam => ({
  examId: "ex1", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [
    { id: "s1", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", "ما هو الراوتر")] },
    { id: "s2", title: "الأمن", gradingPolicy: "all", stimuli: {}, questions: [mcq("q4", "جدار الحماية")] }
  ], ...over
} as StructuredExam);
type Handles = { latest: StructuredExam | null; pastLength: number; undo: () => void };
const h = {} as Handles;
function Host({ initial }: { initial?: StructuredExam }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial ?? makeExam(), "saved"); } }, [hist, initial]);
  useEffect(() => { Object.assign(h, { latest: hist.present, pastLength: hist.history.past.length, undo: hist.undo }); }, [hist]);
  const [saving] = useState(false);
  if (!hist.present) return null;
  return (
    <StructuredExamBuilder exam={hist.present} onChange={u => hist.update(u)} onSave={() => {}} saving={saving}
      onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)}
      backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} />
  );
}
const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const bpBtn = () => screen.getByRole("button", { name: /مخطط الامتحان/ });
const openPanel = async () => { fireEvent.click(bpBtn()); return await screen.findByRole("dialog", { name: "مخطط الامتحان" }); };
const bp = () => h.latest!.blueprint!;
const issueCodes = (dialog: HTMLElement) => Array.from(within(dialog).queryByRole("list", { name: "مشكلات المخطط" })?.querySelectorAll("[data-code]") ?? []).map(li => (li as HTMLElement).getAttribute("data-code"));

beforeEach(() => { window.confirm = vi.fn(() => true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("R1 — curriculum / course / level are authored as complete stable identities (id + label)", () => {
  it("a labelled level without an id is reported (MISSING_CONTEXT_ID), the id field completes it, renaming the label keeps the id", async () => {
    render(<Host initial={makeExam({ blueprint: networkingBlueprint })} />); await tick();
    const dialog = await openPanel();
    const { level: _l, ...rest } = networkingBlueprint; void _l;
    expect(bp().level).toEqual(networkingBlueprint.level);
    // clear both fields → identity removed
    fireEvent.change(within(dialog).getByRole("textbox", { name: "المستوى" }), { target: { value: "" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "معرّف المستوى" }), { target: { value: "" } });
    expect(bp().level).toBeUndefined(); expect(bp()).toEqual({ ...rest });
    // label only → the blueprint carries an INCOMPLETE identity and the panel says so (never a silent "" id)
    fireEvent.change(within(dialog).getByRole("textbox", { name: "المستوى" }), { target: { value: "العاشر" } });
    expect(bp().level).toEqual({ id: "", label: "العاشر" });
    expect(issueCodes(dialog)).toContain("MISSING_CONTEXT_ID");
    expect(bpBtn().querySelector(".sb-bp-badge")?.textContent).toBe("1");
    // explicit stable id → complete, valid
    fireEvent.change(within(dialog).getByRole("textbox", { name: "معرّف المستوى" }), { target: { value: "grade-10" } });
    expect(bp().level).toEqual({ id: "grade-10", label: "العاشر" });
    expect(within(dialog).queryByRole("list", { name: "مشكلات المخطط" })).toBeNull();
    // rename the label → same id (no re-slug), one history step
    const steps = h.pastLength;
    fireEvent.change(within(dialog).getByRole("textbox", { name: "المستوى" }), { target: { value: "الصف العاشر" } });
    expect(bp().level).toEqual({ id: "grade-10", label: "الصف العاشر" }); expect(h.pastLength).toBe(steps + 1);
    act(() => h.undo());
    expect(bp().level).toEqual({ id: "grade-10", label: "العاشر" });
    // curriculum and course have the same id + label controls
    fireEvent.change(within(dialog).getByRole("textbox", { name: "معرّف المنهاج" }), { target: { value: "il-voc" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "المنهاج" }), { target: { value: "مهني" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "معرّف المقرر" }), { target: { value: "791381" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "المقرر" }), { target: { value: "أنظمة محوسبة" } });
    expect(bp().curriculum).toEqual({ id: "il-voc", label: "مهني" }); expect(bp().course).toEqual({ id: "791381", label: "أنظمة محوسبة" });
  });
});

describe("R4 — section constraints are validated against the exam's real sections inside the builder", () => {
  const withSectionConstraint = { ...networkingBlueprint, constraints: [{ id: "c-sec", dimension: "section" as const, ref: "s2", metric: "count" as const, unit: "absolute" as const, target: 1 }] };
  it("valid ref → no badge / no issue; deleting the referenced section → BROKEN_SECTION_REF in the panel and on the badge; renaming the section title keeps it valid", async () => {
    render(<Host initial={makeExam({ blueprint: withSectionConstraint })} />); await tick();
    expect(bpBtn().querySelector(".sb-bp-badge")).toBeNull();
    let dialog = await openPanel();
    expect(within(dialog).queryByRole("list", { name: "مشكلات المخطط" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" })); await tick();
    // rename section s2 (same id) → still valid
    const titleInputs = screen.getAllByPlaceholderText("عنوان القسم");
    fireEvent.change(titleInputs[1], { target: { value: "أمن الشبكات" } });
    expect(h.latest!.sections[1]).toMatchObject({ id: "s2", title: "أمن الشبكات" });
    expect(bpBtn().querySelector(".sb-bp-badge")).toBeNull();
    // delete section s2 → the constraint dangles → structured issue
    fireEvent.click(screen.getAllByRole("button", { name: "حذف القسم" })[1]); await tick();
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s1"]);
    expect(bpBtn().querySelector(".sb-bp-badge")?.textContent).toBe("1");
    dialog = await openPanel();
    expect(issueCodes(dialog)).toEqual(["BROKEN_SECTION_REF"]);
    // undo restores the section and the issue disappears (blueprint itself never rewritten)
    act(() => h.undo()); await tick();
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s1", "s2"]);
    expect(within(dialog).queryByRole("list", { name: "مشكلات المخطط" })).toBeNull();
    expect(bp().constraints[0].ref).toBe("s2");
  });
});
