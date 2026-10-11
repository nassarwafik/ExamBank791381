// @vitest-environment happy-dom
// Phase 21E.1 (slice 2) — the real teacher workflow «delete a question / a section → toast → «تراجع»», through the REAL builder and the
// REAL history hook (the App.tsx wiring): the deletion is announced (never focus-stealing), focus lands on a sensible neighbour, «تراجع»
// brings back the very same object at its place as ONE new history entry while every later edit survives, a restore that is no longer
// safe is refused with a reason, Ctrl+Z / the toolbar undo / another exam make the toast leave, and the action waits while saving.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam } from "./examTypes";
import type { StructuredExamUpdater } from "./examBuilderState";
import { readFileSync } from "fs";
import path from "path";

const makeExam = (examId = "ex1"): StructuredExam => ({
  examId, title: "امتحان الوحدة", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [
    { id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions: [
      { examQuestionId: "q1", presentationType: "shortAnswer", text: "السؤال الأول", marks: 2, answer: { text: "a" } },
      { examQuestionId: "q2", presentationType: "shortAnswer", text: "السؤال الثاني", marks: 2, answer: { text: "b" } },
      { examQuestionId: "q3", presentationType: "shortAnswer", text: "السؤال الثالث", marks: 2, answer: { text: "c" } },
    ] },
    { id: "s2", title: "القسم الثاني", gradingPolicy: "all", stimuli: {}, questions: [
      { examQuestionId: "r1", presentationType: "shortAnswer", text: "سؤال القسم الثاني", marks: 1, answer: { text: "d" } },
    ] },
  ],
} as StructuredExam);

type Handles = { latest: StructuredExam | null; past: number; update: (u: StructuredExamUpdater) => void; undo: () => void; open: (e: StructuredExam) => void; setSaving: (v: boolean) => void };
const h = {} as Handles;
function Host({ initial, toastMs }: { initial?: StructuredExam; toastMs?: number }) {
  const hist = useStructuredExamHistory();
  const [saving, setSaving] = useState(false);
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial ?? makeExam(), "saved"); } }, [hist, initial]);
  useEffect(() => { Object.assign(h, { latest: hist.present, past: hist.history.past.length, update: hist.update, undo: hist.undo, open: (e: StructuredExam) => hist.open(e, "saved"), setSaving }); }, [hist]);
  if (!hist.present) return null;
  return (
    <StructuredExamBuilder
      exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving}
      onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo}
      saveState={examSaveState(hist.history, saving)} backupStorage={null} undoToastMs={toastMs}
    />
  );
}

const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const ids = (sectionId = "s1") => h.latest!.sections.find(s => s.id === sectionId)?.questions.map(q => q.examQuestionId);
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const sectionEl = (id: string) => document.querySelector(`[data-section-id="${id}"]`) as HTMLElement;
const toast = () => screen.queryByRole("group", { name: "إشعار" });
const live = () => document.querySelector(".eb-toast-layer [role='status']") as HTMLElement;
const deleteQuestion = (id: string) => fireEvent.click(within(card(id)).getByRole("button", { name: "حذف" }));
const deleteSection = (id: string) => fireEvent.click(within(sectionEl(id)).getByRole("button", { name: "حذف القسم" }));
const undoQuestion = () => screen.getByRole("button", { name: "تراجع عن حذف السؤال" });
const undoSection = () => screen.getByRole("button", { name: "تراجع عن حذف القسم" });
const titleInput = () => screen.getByPlaceholderText("عنوان الامتحان المنظّم") as HTMLInputElement;

beforeEach(() => { window.confirm = vi.fn(() => true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("21E.1 slice 2 — delete a question → toast → «تراجع»", () => {
  it("announces the deletion, moves focus to the next card, and «تراجع» restores the same object at its place as ONE history entry", async () => {
    render(<Host />);
    await wait(5);
    const before = h.latest!.sections[0].questions[1];
    deleteQuestion("q2");
    expect(ids()).toEqual(["q1", "q3"]);
    expect(toast()!.textContent).toContain("تم حذف السؤال 2 من «القسم الأول».");
    expect(toast()!.closest(".sb-builder")).toBeTruthy();                         // inside the builder overlay (above the toast layer)
    expect(document.activeElement).toBe(card("q3"));                              // focus is never lost to <body>
    await wait(80);
    expect(live().textContent).toBe("تم حذف السؤال 2 من «القسم الأول». للتراجع اضغط Ctrl+Z.");   // announced, with the keyboard route
    expect(screen.getAllByRole("button", { name: "تراجع" })).toHaveLength(1);        // the toolbar's «تراجع» keeps its unique name
    const pastAfterDelete = h.past;
    fireEvent.click(undoQuestion());
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    expect(h.latest!.sections[0].questions[1]).toBe(before);                       // the very same object, unchanged
    expect(h.past).toBe(pastAfterDelete + 1);                                      // one new entry; nothing was popped
    expect(toast()!.textContent).toContain("تمت استعادة السؤال 2.");
    await wait(5);
    expect(document.activeElement).toBe(card("q2"));
    act(() => h.undo());                                                           // the toolbar undo now undoes the restore …
    expect(ids()).toEqual(["q1", "q3"]);
    act(() => h.undo());                                                           // … and then the deletion: history stays linear
    expect(ids()).toEqual(["q1", "q2", "q3"]);
  });

  it("every edit made after the deletion survives «تراجع» (it is never a history pop)", async () => {
    render(<Host />);
    await wait(5);
    deleteQuestion("q2");
    fireEvent.change(titleInput(), { target: { value: "عنوان بعد الحذف" } });
    act(() => h.update(e => ({ ...e, sections: e.sections.map(s => (s.id === "s2" ? { ...s, title: "قسم معدّل" } : s)) })));
    fireEvent.click(undoQuestion());
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    expect(h.latest!.title).toBe("عنوان بعد الحذف");
    expect(h.latest!.sections[1].title).toBe("قسم معدّل");
  });

  it("a restore that is no longer safe is refused with a reason (its section was removed meanwhile) — nothing changes", async () => {
    render(<Host />);
    await wait(5);
    deleteQuestion("q2");
    act(() => h.update(e => ({ ...e, sections: e.sections.filter(s => s.id !== "s1") })));
    const snapshot = h.latest;
    const past = h.past;
    fireEvent.click(undoQuestion());
    expect(h.latest).toBe(snapshot);
    expect(h.past).toBe(past);
    expect(toast()!.textContent).toContain("تعذّرت استعادة السؤال: القسم «القسم الأول» لم يعد موجودًا.");
    expect(toast()!.className).toContain("tone-warn");
  });

  it("Ctrl+Z (or the toolbar «تراجع») brings it back the usual way and the toast leaves by itself", async () => {
    render(<Host />);
    await wait(5);
    deleteQuestion("q2");
    expect(toast()).not.toBeNull();
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true, bubbles: true });
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    expect(toast()).toBeNull();
    deleteQuestion("q1");
    expect(toast()).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "تراجع" }));
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    expect(toast()).toBeNull();
  });

  it("Ctrl+Z pressed while focus is INSIDE the toast (as the announcement suggests) restores it and focuses the restored card", async () => {
    render(<Host />);
    await wait(5);
    deleteQuestion("q2");
    act(() => { undoQuestion().focus(); });
    fireEvent.keyDown(undoQuestion(), { key: "z", ctrlKey: true, bubbles: true });
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    expect(toast()).toBeNull();
    expect(document.activeElement).toBe(card("q2"));
  });

  it("«تراجع» from the keyboard on a refused restore never drops focus to <body>; closing the warn / success toast from the keyboard neither", async () => {
    render(<Host />);
    await wait(5);
    deleteQuestion("q2");
    act(() => h.update(e => ({ ...e, sections: e.sections.filter(s => s.id !== "s1") })));
    act(() => { undoQuestion().focus(); });
    fireEvent.click(undoQuestion());                                               // the focused toast card leaves with the click
    expect(toast()!.className).toContain("tone-warn");
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ إضافة قسم" }));
    const close = within(toast()!).getByRole("button", { name: "إغلاق الإشعار" });
    act(() => { close.focus(); });
    fireEvent.click(close);
    expect(toast()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ إضافة قسم" }));
  });

  it("closing the success toast with focus inside it focuses the restored card", async () => {
    render(<Host />);
    await wait(5);
    deleteQuestion("q2");
    fireEvent.click(undoQuestion());
    await wait(5);
    const close = within(toast()!).getByRole("button", { name: "إغلاق الإشعار" });
    act(() => { close.focus(); });
    fireEvent.keyDown(close, { key: "Escape" });
    expect(toast()).toBeNull();
    expect(document.activeElement).toBe(card("q2"));
  });

  it("Escape inside the toast closes it and returns focus to the neighbour card; the deletion stays", async () => {
    render(<Host />);
    await wait(5);
    deleteQuestion("q3");                                                          // last card → previous neighbour
    expect(document.activeElement).toBe(card("q2"));
    act(() => { undoQuestion().focus(); });
    fireEvent.keyDown(undoQuestion(), { key: "Escape" });
    expect(toast()).toBeNull();
    expect(document.activeElement).toBe(card("q2"));
    expect(ids()).toEqual(["q1", "q2"]);
  });

  it("the toast leaves after its duration (the deletion stays); the only question of a section hands focus to «+ إضافة سؤال»", async () => {
    render(<Host toastMs={120} />);
    await wait(5);
    deleteQuestion("r1");
    expect(document.activeElement).toBe(within(sectionEl("s2")).getByRole("button", { name: "+ إضافة سؤال" }));
    expect(toast()).not.toBeNull();
    await wait(260);
    expect(toast()).toBeNull();
    expect(ids("s2")).toEqual([]);
  });

  it("the action is disabled while the exam is saving and enabled again afterwards", async () => {
    render(<Host />);
    await wait(5);
    deleteQuestion("q2");
    act(() => h.setSaving(true));
    expect((undoQuestion() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(undoQuestion());
    expect(ids()).toEqual(["q1", "q3"]);
    act(() => h.setSaving(false));
    expect((undoQuestion() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(undoQuestion());
    expect(ids()).toEqual(["q1", "q2", "q3"]);
  });

  it("opening another exam closes the toast (its «تراجع» can never touch the other exam)", async () => {
    render(<Host />);
    await wait(5);
    deleteQuestion("q2");
    act(() => h.open(makeExam("ex2")));
    await wait(5);
    expect(toast()).toBeNull();
  });
});

describe("21E.1 slice 2 — delete a section → toast → «تراجع»", () => {
  it("names the section and how many questions left with it, focuses the next section, and «تراجع» restores the same section object", async () => {
    render(<Host />);
    await wait(5);
    const before = h.latest!.sections[0];
    deleteSection("s1");
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s2"]);
    expect(toast()!.textContent).toContain("تم حذف «القسم الأول» مع 3 أسئلة.");
    expect(document.activeElement).toBe(sectionEl("s2"));
    fireEvent.click(undoSection());
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s1", "s2"]);
    expect(h.latest!.sections[0]).toBe(before);
    expect(toast()!.textContent).toContain("تمت استعادة «القسم الأول».");
    await wait(5);
    expect(document.activeElement).toBe(sectionEl("s1"));
  });

  it("deleting the last remaining section hands focus to «+ إضافة قسم»", async () => {
    render(<Host />);
    await wait(5);
    deleteSection("s2");
    expect(document.activeElement).toBe(sectionEl("s1"));                          // previous neighbour
    deleteSection("s1");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ إضافة قسم" }));
    expect(toast()!.textContent).toContain("تم حذف «القسم الأول» مع 3 أسئلة.");     // the newer toast replaced the older one
    fireEvent.click(undoSection());
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s1"]);
  });
});

describe("21E.1 slice 2 — where the restored / focused section lands, and motion", () => {
  const stubMotion = (reduce: boolean) => {
    window.matchMedia = ((q: string) => ({ matches: reduce && q.includes("prefers-reduced-motion: reduce"), media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  };
  for (const reduce of [false, true]) {
    it(`a restored section is scrolled just below the sticky toolbar (${reduce ? "reduced motion: no animation" : "smooth"})`, async () => {
      stubMotion(reduce);
      const calls: { el: Element; opts: unknown }[] = [];
      const original = HTMLElement.prototype.scrollIntoView;
      HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, opts?: unknown) { calls.push({ el: this, opts }); } as typeof original;
      try {
        render(<Host />);
        await wait(5);
        deleteSection("s1");
        expect(document.activeElement).toBe(sectionEl("s2"));
        expect(sectionEl("s2").style.scrollMarginBlockStart).toMatch(/^\d+px$/);   // toolbar height + 12 px (0 + 12 in this DOM)
        calls.length = 0;
        fireEvent.click(undoSection());
        await wait(5);
        expect(document.activeElement).toBe(sectionEl("s1"));
        const last = calls.filter(c => c.el === sectionEl("s1")).pop();
        expect(last?.opts).toEqual({ block: "start", behavior: reduce ? "auto" : "smooth" });
        expect(sectionEl("s1").style.scrollMarginBlockStart).toBe("12px");
      } finally { HTMLElement.prototype.scrollIntoView = original; }
    });
  }
  it("a restored question card is centred when it fits below the sticky toolbar, otherwise aligned by its top just below it", async () => {
    stubMotion(true);
    const calls: { el: Element; opts: unknown }[] = [];
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, opts?: unknown) { calls.push({ el: this, opts }); } as typeof original;
    try {
      render(<Host />);
      await wait(5);
      deleteQuestion("q2");
      fireEvent.click(undoQuestion());
      await wait(5);
      expect(calls.filter(c => c.el === card("q2")).pop()?.opts).toEqual({ block: "center", behavior: "auto" });
      expect(card("q2").style.scrollMarginBlockStart).toBe("12px");
      deleteQuestion("q2");
      const tall = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        return { height: this.id === "sb-q-q2" ? 5000 : 0, width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
      });
      fireEvent.click(undoQuestion());
      await wait(5);
      tall.mockRestore();
      expect(calls.filter(c => c.el === card("q2")).pop()?.opts).toEqual({ block: "start", behavior: "auto" });
      expect(document.activeElement).toBe(card("q2"));
    } finally { HTMLElement.prototype.scrollIntoView = original; }
  });
  it("while a toast is shown the builder scroller reserves room below its last control (focus is never hidden behind the toast)", () => {
    const css = readFileSync(path.join(process.cwd(), "src", "structured-builder.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.structured-builder-overlay:has\(\.eb-toast\)\{padding-block-end:calc\(var\(--eb-space-4\) \* 2 \+ 96px\);scroll-padding-block-end:calc\(var\(--eb-space-4\) \* 2 \+ 96px\)\}/);
  });
});
