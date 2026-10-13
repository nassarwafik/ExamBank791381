// @vitest-environment happy-dom
// Phase 21E.2 part 2 — Review Fix 4, audit A-04: the builder's Ctrl+Z / Ctrl+Y belong to the builder surface only. While another
// modal layer is open above it — the student preview, the unsaved-changes guard, a dialog opened from a menu («مخطط الامتحان») —
// the keys neither change the exam hidden behind that layer nor take the key from it (no preventDefault), exactly like Escape and
// Tab (useModalSurface). Through the REAL StructuredExamBuilder + REAL history hook inside a replica of App's overlay.
// The browser's OWN undo reaches behind the layer too (real Chromium: Ctrl+Z on «← إغلاق المعاينة» fires a `beforeinput` historyUndo
// on the exam title hidden behind the preview): while a modal layer is open, that history step is refused for a builder field; a field
// of the layer keeps its native undo.
// Fail-first on 1fa3d21: Ctrl+Z on «← إغلاق المعاينة» / a preview choice / «البقاء في المحرر» / the blueprint dialog's «إغلاق»
// reverted the title behind the layer (and the keydown was prevented); a historyUndo beforeinput on the title was not refused.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, act, screen, within } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import { clickToolbarItem } from "./builder/toolbarTestActions";
import type { StructuredExam } from "./examTypes";

const EDITED = "عنوان معدّل", ORIGINAL = "اختبار الوحدة الثانية";
const makeExam = (): StructuredExam => ({ examId: "exA04", title: ORIGINAL, status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions: [
    { examQuestionId: "q1", presentationType: "multipleChoice", text: "اختر بروتوكول النقل", marks: 2, options: [{ text: "TCP" }, { text: "IP" }], answer: { correctOptionIndex: 0 } },
    { examQuestionId: "q2", presentationType: "shortAnswer", text: "ما هو المبدّل", marks: 2, answer: { text: "-" } }] }] } as unknown as StructuredExam);

const h = {} as { present: StructuredExam | null };
function Host() {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(makeExam(), "saved"); } }, [hist]);
  useEffect(() => { h.present = hist.present; });
  if (!hist.present) return null;
  return (
    <div className="structured-builder-overlay" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="sb-builder-title" tabIndex={-1}>
      <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo}
        canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} onRecover={hist.recover}
        autosaveDelayMs={5} onExit={() => {}} />
    </div>
  );
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  HTMLElement.prototype.scrollIntoView = function () {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const mount = async () => { render(<Host />); await tick(); };
const titleInput = () => screen.getByRole("textbox", { name: "عنوان الامتحان" }) as HTMLInputElement;
const editTitle = async () => { fireEvent.change(titleInput(), { target: { value: EDITED } }); await tick(); expect(h.present!.title).toBe(EDITED); };
/** A history key pressed on `el`; returns whether the key was taken (preventDefault) — the default action was cancelled. */
const press = (el: Element, init: KeyboardEventInit) => { let taken = false; act(() => { taken = !fireEvent.keyDown(el, init); }); return taken; };
const UNDO = { key: "z", ctrlKey: true }, REDO = { key: "y", ctrlKey: true }, REDO_SHIFT = { key: "z", ctrlKey: true, shiftKey: true };
/** The browser's native history step arriving at a field (Chromium fires it at the page's last edited text field); returns whether
 *  it was refused (preventDefault on the cancelable beforeinput). */
const nativeHistory = (el: Element, inputType: "historyUndo" | "historyRedo") => {
  const ev = new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true });
  act(() => { el.dispatchEvent(ev); });
  return ev.defaultPrevented;
};
const toolbarButton = (name: string) => within(document.querySelector<HTMLElement>(".sb-toolbar")!).getByRole("button", { name });

describe("RF4 A-04 — Ctrl+Z / Ctrl+Y never act under another modal layer", () => {
  it("the student preview: Ctrl+Z on «← إغلاق المعاينة» and on a preview choice leaves the exam and the key alone; after closing it, Ctrl+Z undoes", async () => {
    await mount();
    await editTitle();
    fireEvent.click(toolbarButton("معاينة الامتحان"));
    await tick();
    const preview = document.querySelector<HTMLElement>(".sb-preview-overlay")!;
    expect(preview.getAttribute("aria-modal")).toBe("true");
    const close = within(preview).getByRole("button", { name: "← إغلاق المعاينة" });
    expect(press(close, UNDO)).toBe(false);
    expect(h.present!.title).toBe(EDITED);
    const choice = within(preview).getAllByRole("radio")[0];
    expect(press(choice, UNDO)).toBe(false);
    expect(press(choice, REDO_SHIFT)).toBe(false);
    expect(h.present!.title).toBe(EDITED);
    expect(press(document.body, UNDO)).toBe(false);                                // focus anywhere: the layer is still open
    expect(h.present!.title).toBe(EDITED);
    fireEvent.click(close);
    await tick();
    expect(document.querySelector(".sb-preview-overlay")).toBeNull();
    expect(press(toolbarButton("معاينة الامتحان"), UNDO)).toBe(true);              // the builder surface again: undo, key taken
    expect(h.present!.title).toBe(ORIGINAL);
    expect(press(toolbarButton("معاينة الامتحان"), REDO)).toBe(true);
    expect(h.present!.title).toBe(EDITED);
  });

  it("the unsaved-changes guard: Ctrl+Z / Ctrl+Y on «البقاء في المحرر» change nothing while it says there are unsaved changes", async () => {
    await mount();
    await editTitle();
    fireEvent.click(toolbarButton("رجوع"));
    await tick();
    const guard = screen.getByRole("dialog", { name: "تغييرات غير محفوظة" });
    const stay = within(guard).getByRole("button", { name: "البقاء في المحرر" });
    expect(press(stay, UNDO)).toBe(false);
    expect(h.present!.title).toBe(EDITED);
    expect(press(stay, REDO)).toBe(false);
    expect(h.present!.title).toBe(EDITED);
    expect(screen.getByRole("dialog", { name: "تغييرات غير محفوظة" })).toBe(guard);
    fireEvent.click(stay);
    await tick();
    expect(screen.queryByRole("dialog", { name: "تغييرات غير محفوظة" })).toBeNull();
    expect(press(toolbarButton("رجوع"), UNDO)).toBe(true);
    expect(h.present!.title).toBe(ORIGINAL);
  });

  it("a dialog opened from «المزيد» («مخطط الامتحان»): Ctrl+Z on its «إغلاق» leaves the exam behind it alone", async () => {
    await mount();
    await editTitle();
    clickToolbarItem("مخطط الامتحان");
    const dialog = await screen.findByRole("dialog", { name: "مخطط الامتحان" }, { timeout: 3000 });
    const close = within(dialog).getByRole("button", { name: "إغلاق" });
    expect(press(close, UNDO)).toBe(false);
    expect(press(close, REDO_SHIFT)).toBe(false);
    expect(h.present!.title).toBe(EDITED);
    fireEvent.click(close);
    await tick(50);
    expect(screen.queryByRole("dialog", { name: "مخطط الامتحان" })).toBeNull();
    expect(press(toolbarButton("معاينة الامتحان"), UNDO)).toBe(true);
    expect(h.present!.title).toBe(ORIGINAL);
  });

  it("the browser's own undo / redo (beforeinput historyUndo / historyRedo) is refused for a builder field while a layer is open — never for the layer's own field, never without a layer", async () => {
    await mount();
    await editTitle();
    expect(nativeHistory(titleInput(), "historyUndo")).toBe(false);               // no layer: the field's native undo (13A)
    fireEvent.click(toolbarButton("معاينة الامتحان"));
    await tick();
    const preview = document.querySelector<HTMLElement>(".sb-preview-overlay")!;
    expect(nativeHistory(titleInput(), "historyUndo")).toBe(true);                // the title behind the preview
    expect(nativeHistory(titleInput(), "historyRedo")).toBe(true);
    const own = within(preview).getAllByRole("textbox")[0];                       // a field of the preview itself
    expect(nativeHistory(own, "historyUndo")).toBe(false);
    const typing = new InputEvent("beforeinput", { inputType: "insertText", data: "x", bubbles: true, cancelable: true });
    act(() => { titleInput().dispatchEvent(typing); });
    expect(typing.defaultPrevented).toBe(false);                                   // only the history steps are refused
    // a modal layer rendered INSIDE the builder (none is today: every layer is portalled to <body>) keeps its own fields' native undo
    const inner = document.createElement("div");
    inner.setAttribute("role", "dialog"); inner.setAttribute("aria-modal", "true");
    const innerField = document.createElement("input");
    inner.appendChild(innerField);
    document.querySelector(".sb-builder")!.appendChild(inner);
    expect(nativeHistory(innerField, "historyUndo")).toBe(false);
    expect(nativeHistory(titleInput(), "historyUndo")).toBe(true);
    inner.remove();
    fireEvent.click(within(preview).getByRole("button", { name: "← إغلاق المعاينة" }));
    await tick();
    expect(nativeHistory(titleInput(), "historyUndo")).toBe(false);
    fireEvent.click(toolbarButton("رجوع"));
    await tick();
    expect(screen.getByRole("dialog", { name: "تغييرات غير محفوظة" })).toBeTruthy();
    expect(nativeHistory(titleInput(), "historyUndo")).toBe(true);                // the title behind the guard
    expect(h.present!.title).toBe(EDITED);
  });

  it("pin: with no modal layer above it the builder keeps its keys — and a text field keeps its own (13A)", async () => {
    await mount();
    await editTitle();
    expect(press(titleInput(), UNDO)).toBe(false);                                 // the field's native undo (13A)
    expect(h.present!.title).toBe(EDITED);
    expect(press(document.body, UNDO)).toBe(true);
    expect(h.present!.title).toBe(ORIGINAL);
  });
});
