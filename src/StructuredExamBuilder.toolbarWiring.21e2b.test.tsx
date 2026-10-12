// @vitest-environment happy-dom
// Phase 21E.2 (part 2) — the builder integration through the REAL StructuredExamBuilder + REAL history hook, inside a replica of
// App's overlay (App.tsx renders exactly this wrapper; the source pin below keeps the two in step):
//   A  at most eight visible toolbar actions, icon-labelled (no emoji in any name); every other tool is the same handler in a menu;
//   B  the overlay is a named modal dialog; Escape takes the existing exit path, so the unsaved-changes guard decides — and does
//      nothing while a save is in flight (the exit button is disabled then too); a menu or dialog above keeps Escape for itself;
//   F  the save actions read the shared save-label table.
// Fail-first: against aa3f0ca (no wiring) the toolbar, Escape and label tests fail; "Escape while saving" also failed on the first
// wiring (Escape ignored the saving gate), which this test drove.
import { describe, it, expect, afterEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam, BuilderQuestion } from "./examTypes";
import { SAVE_LABELS } from "./teacher/saveLabels";
import { toolbarItem } from "./builder/toolbarTestActions";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mcq = (id: string, text: string): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } } as BuilderQuestion);
const makeExam = (): StructuredExam => ({ examId: "ex1", title: "امتحان الشبكات", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [{ id: "s1", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", "ما هو الراوتر"), mcq("q2", "طبقات OSI")] }] } as StructuredExam);
const bank = { scope: { subjectId: "networking", courseId: "791381" }, list: vi.fn(async () => []), select: vi.fn(async () => []) };

const h = {} as { update: (u: (e: StructuredExam) => StructuredExam) => void; setSaving: (v: boolean) => void };
function Host({ onExit }: { onExit: () => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(makeExam(), "saved"); } }, [hist]);
  useEffect(() => { Object.assign(h, { update: hist.update, setSaving }); }, [hist]);
  if (!hist.present) return null;
  return (
    <div className="structured-builder-overlay" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="sb-builder-title" tabIndex={-1}>
      <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo}
        canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} onRecover={hist.recover}
        autosaveDelayMs={5} onExit={onExit} bankPicker={bank as never} />
    </div>
  );
}
const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const mount = async () => { const onExit = vi.fn(); render(<Host onExit={onExit} />); await tick(); return onExit; };
const toolbar = () => document.querySelector<HTMLElement>(".sb-toolbar")!;
const escapeOn = (el: Element) => fireEvent.keyDown(el, { key: "Escape" });
const EMOJI = /\p{Extended_Pictographic}/u;

describe("A — the builder toolbar", () => {
  it("shows exactly the eight actions, in order, named by text (no emoji); the title stays an input", async () => {
    await mount();
    const names = within(toolbar()).getAllByRole("button").map(b => (b.getAttribute("aria-label") || b.textContent || "").replace(/\s+/g, " ").trim());
    expect(names).toEqual(["رجوع", "تراجع", "إعادة", "إضافة أسئلة", "معاينة الامتحان", "المزيد من أدوات الامتحان", SAVE_LABELS.saveDraft, SAVE_LABELS.finalizeExam]);
    for (const n of names) expect(EMOJI.test(n), n).toBe(false);
    expect(within(toolbar()).getByRole("textbox", { name: "عنوان الامتحان" })).toBeTruthy();
  });
  it("the tools that left the toolbar are the same actions inside its menus (bank under «إضافة أسئلة», analysis tools under «المزيد»)", async () => {
    await mount();
    expect(toolbarItem(/بنك الأسئلة/).closest(".eb-menu-panel")).not.toBeNull();
    for (const tool of [/مستكشف الأسئلة/, /مخطط الامتحان/, /العرض والتصميم/]) {          // toolbarItem closes any open menu first
      const item = toolbarItem(tool);
      expect(item.closest(".eb-menu-panel"), String(tool)).not.toBeNull();
      expect(EMOJI.test(item.textContent || ""), String(tool)).toBe(false);
    }
  });
});

describe("B — the overlay is a modal workspace; Escape takes the exit path", () => {
  it("App renders the builder inside a named modal dialog whose name is the toolbar heading", () => {
    const app = readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");
    expect(app).toContain('<div className="structured-builder-overlay" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="sb-builder-title" tabIndex={-1}>');
    const builder = readFileSync(path.join(process.cwd(), "src", "StructuredExamBuilder.tsx"), "utf8");
    expect(builder).toContain('const BUILDER_TITLE_ID = "sb-builder-title";');
  });
  it("names the dialog by the toolbar heading", async () => {
    await mount();
    expect(screen.getByRole("dialog", { name: /باني الامتحان المنظّم: امتحان الشبكات/ })).toBeTruthy();
  });
  it("nothing unsaved: Escape leaves at once (the exit path's own guard has nothing to ask)", async () => {
    const onExit = await mount();
    escapeOn(toolbar());
    await tick();
    expect(onExit).toHaveBeenCalledTimes(1);
  });
  it("unsaved changes: Escape asks the unsaved-changes guard; «البقاء في المحرر» keeps the builder and the edit", async () => {
    const onExit = await mount();
    act(() => h.update(e => ({ ...e, title: "امتحان معدّل" })));
    await tick();
    escapeOn(toolbar());
    const guard = await screen.findByRole("dialog", { name: "تغييرات غير محفوظة" });
    fireEvent.click(within(guard).getByRole("button", { name: "البقاء في المحرر" }));
    await tick();
    expect(onExit).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox", { name: "عنوان الامتحان" }) as HTMLInputElement).value).toBe("امتحان معدّل");
  });
  it("while a save is in flight Escape does nothing — like the disabled «رجوع» — and asks nothing", async () => {
    const onExit = await mount();
    act(() => h.update(e => ({ ...e, title: "امتحان معدّل" })));
    act(() => h.setSaving(true));
    await tick();
    expect((within(toolbar()).getByRole("button", { name: "رجوع" }) as HTMLButtonElement).disabled).toBe(true);
    escapeOn(toolbar());
    await tick(20);
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "تغييرات غير محفوظة" })).toBeNull();
  });
  it("Escape inside an open menu closes the menu only, focus back on its trigger; the builder stays", async () => {
    const onExit = await mount();
    const item = toolbarItem(/مخطط الامتحان/);                       // opens «المزيد»
    item.focus();
    escapeOn(item);
    await tick();
    const trigger = screen.getByRole("button", { name: "المزيد من أدوات الامتحان" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    expect(onExit).not.toHaveBeenCalled();
  });
});

describe("F — save labels from the shared table", () => {
  it("draft / finalize read SAVE_LABELS; while saving the draft action says «جارٍ الحفظ…»", async () => {
    await mount();
    expect(within(toolbar()).getByRole("button", { name: SAVE_LABELS.saveDraft })).toBeTruthy();
    expect(within(toolbar()).getByRole("button", { name: SAVE_LABELS.finalizeExam })).toBeTruthy();
    act(() => h.setSaving(true));
    await tick();
    expect(within(toolbar()).getByRole("button", { name: SAVE_LABELS.saving })).toBeTruthy();
  });
});
