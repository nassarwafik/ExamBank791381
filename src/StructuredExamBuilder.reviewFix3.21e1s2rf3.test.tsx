// @vitest-environment happy-dom
// Phase 21E.1 slice 2 — Review Fix 3 (independent review of 9aa0b83, confirmed by two skeptics each). Fail-first on 9aa0b83:
//  1. The room below the builder for the toast was reserved at ALL times (`.structured-builder-overlay:has(.sb-builder)`): outside
//     the sticky toolbar's containing block, it pushed the stuck toolbar up at the end of the scroll range and hid «+ إضافة قسم»
//     under it at 150 % on a 720p screen, 175 %, 200 % and on a phone — with no toast at all (WCAG 2.4.11, a regression vs main).
//     The reserve now exists only while a toast is shown, or from the moment a deletion / restore reveals its target (so the
//     reveal still has the scroll range it needs) until its toasts have left.
//  2. After «تراجع» → Ctrl+Z, a LATER Ctrl+Y (the teacher working elsewhere meanwhile) pulled focus back to the restored item and
//     scrolled the page thousands of px. The history recovery now moves focus only when it was lost, or when it still sits on the
//     neighbour the recovery itself chose.
//  3. Same root cause: an item brought back by Ctrl+Z pressed INSIDE the deletion toast was not remembered, so the next Ctrl+Y
//     dropped focus to <body>; and the success toast «تمت استعادة …» stayed on screen after Ctrl+Z removed the item again.
// Geometry is controlled per element like the Review Fix 1 / 2 files (happy-dom has no layout); Chromium measures the real thing.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam } from "./examTypes";
import type { StructuredExamUpdater } from "./examBuilderState";

const Q = (id: string, text = "نص " + id, displayNumber?: string) => ({ examQuestionId: id, presentationType: "shortAnswer", text, marks: 2, answer: { text: "x" }, ...(displayNumber ? { displayNumber } : {}) });
const makeExam = (sections?: StructuredExam["sections"]): StructuredExam => ({
  examId: "ex1", title: "امتحان الوحدة", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: sections ?? [
    { id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions: [Q("q1"), Q("q2"), Q("q3")] },
    { id: "s2", title: "القسم الثاني", gradingPolicy: "all", stimuli: {}, questions: [Q("r1")] },
  ],
} as unknown as StructuredExam);

type Handles = { latest: StructuredExam | null; past: number; update: (u: StructuredExamUpdater) => void; setSaving: (v: boolean) => void };
const h = {} as Handles;
function Host({ initial, scrollerPadding = "16px" }: { initial?: StructuredExam; scrollerPadding?: string }) {
  const hist = useStructuredExamHistory();
  const [saving, setSaving] = useState(false);
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial ?? makeExam(), "saved"); } }, [hist, initial]);
  useEffect(() => { Object.assign(h, { latest: hist.present, past: hist.history.past.length, update: hist.update, setSaving }); }, [hist]);
  if (!hist.present) return null;
  return (
    <div className="structured-builder-overlay" style={{ paddingTop: scrollerPadding }}>
      <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo}
        canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} />
    </div>
  );
}

// ── controlled layout: viewport 800 px; the stuck toolbar sits 16 px down (the scroller's padding) and is 120 px tall → bottom 136,
// resting clearance 148; every other element is visible at top 300 unless overridden ──
const VIEW_H = 800, TOOLBAR_H = 120, PAD = 16;
type Box = { top: number; height: number };
let geo: Record<string, Box> = {};
const keyOf = (el: Element) => (el.classList.contains("sb-toolbar") ? "toolbar" : el.classList.contains("structured-builder-overlay") ? "scroller" : el.id ? el.id
  : (el as HTMLElement).dataset?.sectionId ? "section-" + (el as HTMLElement).dataset.sectionId
  : el.hasAttribute("data-add-question") ? "add-question-" + (el.closest("[data-section-id]") as HTMLElement | null)?.dataset.sectionId
  : el.hasAttribute("data-add-section") ? "add-section" : "");
let focusCalls: { key: string; opts: FocusOptions | undefined }[] = [];
let scrollCalls: { key: string; opts: ScrollIntoViewOptions | undefined; margin: string }[] = [];
const original = { focus: HTMLElement.prototype.focus, scroll: HTMLElement.prototype.scrollIntoView, matchMedia: window.matchMedia };
beforeEach(() => {
  geo = { toolbar: { top: PAD, height: TOOLBAR_H }, scroller: { top: 0, height: VIEW_H } };
  focusCalls = []; scrollCalls = [];
  Object.defineProperty(window, "innerHeight", { configurable: true, value: VIEW_H });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const b = geo[keyOf(this)] ?? { top: 300, height: 200 };
    return { top: b.top, bottom: b.top + b.height, height: b.height, left: 0, right: 640, width: 640, x: 0, y: b.top, toJSON() {} } as DOMRect;
  });
  HTMLElement.prototype.focus = function (this: HTMLElement, opts?: FocusOptions) { focusCalls.push({ key: keyOf(this), opts }); return original.focus.call(this, opts); };
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, opts?: boolean | ScrollIntoViewOptions) { scrollCalls.push({ key: keyOf(this), opts: opts as ScrollIntoViewOptions, margin: this.style.scrollMarginBlockStart }); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); HTMLElement.prototype.focus = original.focus; HTMLElement.prototype.scrollIntoView = original.scroll; window.matchMedia = original.matchMedia; });

const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const start = async (ui = <Host />) => { geo = { toolbar: { top: PAD, height: TOOLBAR_H }, scroller: { top: 0, height: VIEW_H } }; render(ui); await wait(5); focusCalls = []; scrollCalls = []; };
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const toast = () => screen.queryByRole("group", { name: "إشعار" });
const deleteQuestion = (id: string) => fireEvent.click(within(card(id)).getByRole("button", { name: "حذف" }));
const undoQuestion = () => screen.getByRole("button", { name: "تراجع عن حذف السؤال" });
const closeBtn = () => within(toast()!).getByRole("button", { name: "إغلاق الإشعار" });
const POINTER = { detail: 1 };                                             // a mouse / touch click (a keyboard activation has detail 0)
const hide = (key: string) => { geo[key] = { top: 900, height: 200 }; };   // below the viewport: the heading is hidden
const focusOn = (el: HTMLElement) => act(() => { el.focus(); });


const overlay = () => document.querySelector(".structured-builder-overlay") as HTMLElement;
const reserved = () => overlay().hasAttribute("data-toast-reserve");
const key = (k: string, extra: object = {}) => fireEvent.keyDown(document.activeElement ?? document.body, { key: k, ctrlKey: true, bubbles: true, ...extra });

describe("RF3 — the room below the builder exists only while a toast needs it", () => {
  it("CSS: no permanent reserve; padding + scroll-padding only while a toast is shown or a reveal has reserved it", () => {
    const css = readFileSync(path.join(process.cwd(), "src", "structured-builder.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/:has\(\.sb-builder\)\{[^}]*padding-block-end/);
    expect(css).toMatch(/\.structured-builder-overlay:has\(\.eb-toast\),\.structured-builder-overlay\[data-toast-reserve\]\{padding-block-end:calc\(var\(--eb-space-4\) \* 2 \+ 96px\);scroll-padding-block-end:calc\(var\(--eb-space-4\) \* 2 \+ 96px\)\}/);
  });
  it("no deletion → no reserve; the deletion's reveal already has it; it is released once the toast has left", async () => {
    vi.useFakeTimers();
    try {
      render(<Host />);
      await act(async () => { await vi.advanceTimersByTimeAsync(5); });
      expect(reserved()).toBe(false);
      hide("sb-q-q3");                                                       // the neighbour must be revealed
      let reservedAtReveal: boolean | null = null;
      const scroll = HTMLElement.prototype.scrollIntoView;
      HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, o?: boolean | ScrollIntoViewOptions) { if (reservedAtReveal === null) reservedAtReveal = reserved(); return scroll.call(this, o); };
      deleteQuestion("q2");
      HTMLElement.prototype.scrollIntoView = scroll;
      expect(reservedAtReveal).toBe(true);
      expect(toast()).not.toBeNull();
      expect(reserved()).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(10050); });   // the 10 s toast times out
      expect(toast()).toBeNull();
      expect(reserved()).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it("«تراجع»: the reserve stays through the success toast and is released after it; a replaced toast never releases it early", async () => {
    vi.useFakeTimers();
    try {
      render(<Host />);
      await act(async () => { await vi.advanceTimersByTimeAsync(5); });
      deleteQuestion("q1");
      deleteQuestion("q2");                                                  // toast 1 replaced by toast 2
      expect(reserved()).toBe(true);
      fireEvent.click(undoQuestion());
      await act(async () => { await vi.advanceTimersByTimeAsync(5); });
      expect(toast()?.className).toContain("tone-success");
      expect(reserved()).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
      expect(toast()).toBeNull();
      expect(reserved()).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it("closing the toast (×) releases the reserve; unmounting the builder never leaves it on the scroller", async () => {
    await start();
    deleteQuestion("q2");
    expect(reserved()).toBe(true);
    fireEvent.click(closeBtn(), POINTER);
    await wait(5);
    expect(reserved()).toBe(false);
    deleteQuestion("q3");
    const el = overlay();
    expect(el.hasAttribute("data-toast-reserve")).toBe(true);
    cleanup();
    expect(el.hasAttribute("data-toast-reserve")).toBe(false);
  });
});

describe("RF3 — a later Ctrl+Y never steals focus or scrolls the page", () => {
  it("«تراجع» → Ctrl+Z → the teacher moves on to another card → Ctrl+Y brings the item back WITHOUT moving focus or the page", async () => {
    await start();
    deleteQuestion("q2");
    fireEvent.click(undoQuestion());
    await wait(5);
    key("z");
    expect(document.activeElement).toBe(card("q3"));
    focusOn(card("q1"));                                                     // the teacher works elsewhere now
    hide("sb-q-q2");                                                         // the item would have to be scrolled into view
    focusCalls = []; scrollCalls = [];
    key("y");
    expect(h.latest!.sections[0].questions.map(q => q.examQuestionId)).toEqual(["q1", "q2", "q3"]);
    expect(document.activeElement).toBe(card("q1"));
    expect(scrollCalls).toEqual([]);
    expect(focusCalls.filter(c => c.key === "sb-q-q2")).toEqual([]);
  });
  it("…a focused control in an open dialog (or any focused control) keeps focus too; the recovery's own neighbour still follows the item back", async () => {
    await start();
    deleteQuestion("q2");
    fireEvent.click(undoQuestion());
    await wait(5);
    key("z");
    expect(document.activeElement).toBe(card("q3"));                         // focus on the neighbour the recovery chose …
    key("y");
    expect(document.activeElement).toBe(card("q2"));                         // … follows the item back (unchanged RF2 behaviour)
    key("z");
    expect(document.activeElement).toBe(card("q3"));
    const outside = document.createElement("button"); outside.textContent = "زر في حوار"; document.body.appendChild(outside);
    focusOn(outside);
    key("y", { target: outside });
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe("RF3 — the same recovery for an item brought back by Ctrl+Z INSIDE the toast; the success toast leaves with its item", () => {
  it("Ctrl+Z inside the deletion toast → the item is back and focused; the next Ctrl+Y never leaves focus on <body>", async () => {
    await start();
    deleteQuestion("q2");
    focusOn(closeBtn());
    key("z");
    await wait(5);
    expect(h.latest!.sections[0].questions.map(q => q.examQuestionId)).toEqual(["q1", "q2", "q3"]);
    expect(document.activeElement).toBe(card("q2"));
    key("y");
    expect(h.latest!.sections[0].questions.map(q => q.examQuestionId)).toEqual(["q1", "q3"]);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(card("q3"));
  });
  it("«تراجع» shows «تمت استعادة …»; a Ctrl+Z that removes the item again also removes that success toast", async () => {
    await start();
    deleteQuestion("q2");
    fireEvent.click(undoQuestion());
    await wait(5);
    expect(toast()?.className).toContain("tone-success");
    key("z");
    await wait(5);
    expect(h.latest!.sections[0].questions.map(q => q.examQuestionId)).toEqual(["q1", "q3"]);
    expect(toast()).toBeNull();
  });
});
