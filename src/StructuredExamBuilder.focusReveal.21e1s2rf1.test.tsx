// @vitest-environment happy-dom
// Phase 21E.1 slice 2 — Review Fix 1 (R1): where focus and the page land after deleting a question or a section. The builder has a
// sticky toolbar; a plain `element.focus()` lets the browser pick the scroll position, which could leave the next card's heading and
// tools under that toolbar. Contract: focus always moves with `preventScroll: true`; the page does NOT move when the target's heading
// is already on screen (below the sticky toolbar, above the toast band at the bottom); otherwise the target is revealed just below
// the toolbar with the same mechanism a restored card / section uses (measured toolbar height + 12 px). Mouse and keyboard deletion
// take the same path; «تراجع» still restores the same object at its place. Geometry is controlled per element (happy-dom has no
// layout). Fail-first: on 77337030 the neighbour gets a plain focus() and a hidden heading is never revealed.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam } from "./examTypes";

const Q = (id: string, text: string) => ({ examQuestionId: id, presentationType: "shortAnswer", text, marks: 2, answer: { text: "x" } });
const makeExam = (): StructuredExam => ({
  examId: "ex1", title: "امتحان الوحدة", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [
    { id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions: [Q("q1", "الأول"), Q("q2", "الثاني"), Q("q3", "الثالث")] },
    { id: "s2", title: "القسم الثاني", gradingPolicy: "all", stimuli: {}, questions: [Q("r1", "سؤال القسم الثاني")] },
    { id: "s3", title: "القسم الثالث", gradingPolicy: "all", stimuli: {}, questions: [] },
  ],
} as unknown as StructuredExam);

const h = {} as { latest: StructuredExam | null };
function Host() {
  const hist = useStructuredExamHistory();
  const [saving] = useState(false);
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(makeExam(), "saved"); } }, [hist]);
  useEffect(() => { h.latest = hist.present; }, [hist]);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo}
    canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} />;
}

// ── controlled layout: the viewport is 800 px high, the sticky toolbar ends at 120 px, the toast band is the bottom 128 px ──
const VIEW_H = 800, TOOLBAR_BOTTOM = 120, CLEARANCE = TOOLBAR_BOTTOM + 12;
type Box = { top: number; height: number };
let geo: Record<string, Box> = {};
const keyOf = (el: Element) => (el.classList.contains("sb-toolbar") ? "toolbar" : el.id ? el.id
  : (el as HTMLElement).dataset?.sectionId ? "section-" + (el as HTMLElement).dataset.sectionId
  : el.hasAttribute("data-add-question") ? "add-question-" + (el.closest("[data-section-id]") as HTMLElement | null)?.dataset.sectionId
  : el.hasAttribute("data-add-section") ? "add-section" : "");
let focusCalls: { key: string; opts: unknown }[] = [];
let scrollCalls: { key: string; opts: unknown }[] = [];
const original = { focus: HTMLElement.prototype.focus, scroll: HTMLElement.prototype.scrollIntoView };
beforeEach(() => {
  geo = { toolbar: { top: 0, height: TOOLBAR_BOTTOM } };
  focusCalls = []; scrollCalls = [];
  Object.defineProperty(window, "innerHeight", { configurable: true, value: VIEW_H });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const b = geo[keyOf(this)] ?? { top: 0, height: 0 };
    return { top: b.top, bottom: b.top + b.height, height: b.height, left: 0, right: 640, width: 640, x: 0, y: b.top, toJSON() {} } as DOMRect;
  });
  HTMLElement.prototype.focus = function (this: HTMLElement, opts?: FocusOptions) { focusCalls.push({ key: keyOf(this), opts }); return original.focus.call(this, opts); };
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, opts?: boolean | ScrollIntoViewOptions) { scrollCalls.push({ key: keyOf(this), opts }); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); HTMLElement.prototype.focus = original.focus; HTMLElement.prototype.scrollIntoView = original.scroll; });

const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const sectionEl = (id: string) => document.querySelector(`[data-section-id="${id}"]`) as HTMLElement;
const ids = (sid = "s1") => h.latest!.sections.find(s => s.id === sid)?.questions.map(q => q.examQuestionId);
const deleteBtn = (id: string) => within(card(id)).getByRole("button", { name: "حذف" });
const lastFocus = (key: string) => focusCalls.filter(c => c.key === key).pop();
const scrollsOf = (key: string) => scrollCalls.filter(c => c.key === key);
const start = async () => { render(<Host />); await wait(5); focusCalls = []; scrollCalls = []; };

describe("21E.1 slice 2 RF1 (R1) — focus after deleting a QUESTION", () => {
  it("the next card's heading is on screen → focus moves there with preventScroll and the page does not move (mouse)", async () => {
    await start();
    geo["sb-q-q3"] = { top: 400, height: 300 };
    fireEvent.click(deleteBtn("q2"));
    expect(ids()).toEqual(["q1", "q3"]);
    expect(document.activeElement).toBe(card("q3"));
    expect(lastFocus("sb-q-q3")?.opts).toEqual({ preventScroll: true });
    expect(scrollCalls).toEqual([]);
  });

  it("same from the keyboard (focus on «حذف», then activate it): focus moves with preventScroll, no scroll", async () => {
    await start();
    geo["sb-q-q3"] = { top: 400, height: 300 };
    const btn = deleteBtn("q2");
    act(() => { btn.focus(); });
    fireEvent.click(btn);
    expect(document.activeElement).toBe(card("q3"));
    expect(lastFocus("sb-q-q3")?.opts).toEqual({ preventScroll: true });
    expect(scrollsOf("sb-q-q3")).toEqual([]);
  });

  it("the next card's heading is UNDER the sticky toolbar → it is revealed just below it (centred when it fits)", async () => {
    await start();
    geo["sb-q-q3"] = { top: 60, height: 300 };
    fireEvent.click(deleteBtn("q2"));
    expect(document.activeElement).toBe(card("q3"));
    expect(lastFocus("sb-q-q3")?.opts).toEqual({ preventScroll: true });
    expect(scrollsOf("sb-q-q3").pop()?.opts).toEqual({ block: "center", behavior: "smooth" });
    expect(card("q3").style.scrollMarginBlockStart).toBe(CLEARANCE + "px");
  });

  it("a tall next card whose heading is under the toolbar is aligned by its top just below it", async () => {
    await start();
    geo["sb-q-q3"] = { top: -500, height: 2000 };
    fireEvent.click(deleteBtn("q2"));
    expect(scrollsOf("sb-q-q3").pop()?.opts).toEqual({ block: "start", behavior: "smooth" });
    expect(card("q3").style.scrollMarginBlockStart).toBe(CLEARANCE + "px");
  });

  it("a heading in the band the toast is about to cover (bottom 128 px) is revealed too", async () => {
    await start();
    geo["sb-q-q3"] = { top: VIEW_H - 100, height: 300 };
    fireEvent.click(deleteBtn("q2"));
    expect(scrollsOf("sb-q-q3").length).toBe(1);
    expect(lastFocus("sb-q-q3")?.opts).toEqual({ preventScroll: true });
  });

  it("the only question of a section: «+ إضافة سؤال» gets focus without scrolling when visible, and is revealed when hidden", async () => {
    await start();
    geo["add-question-s2"] = { top: 300, height: 44 };
    fireEvent.click(deleteBtn("r1"));
    const add = within(sectionEl("s2")).getByRole("button", { name: "+ إضافة سؤال" });
    expect(document.activeElement).toBe(add);
    expect(lastFocus("add-question-s2")?.opts).toEqual({ preventScroll: true });
    expect(scrollCalls).toEqual([]);
  });
  it("…and a «+ إضافة سؤال» hidden under the toolbar is revealed (nearest, clear of the toolbar above and the toast band below)", async () => {
    await start();
    geo["add-question-s2"] = { top: 40, height: 44 };
    fireEvent.click(deleteBtn("r1"));
    const add = within(sectionEl("s2")).getByRole("button", { name: "+ إضافة سؤال" });
    expect(document.activeElement).toBe(add);
    expect(lastFocus("add-question-s2")?.opts).toEqual({ preventScroll: true });
    expect(scrollsOf("add-question-s2").pop()?.opts).toEqual({ block: "nearest", behavior: "smooth" });
    expect(add.style.scrollMarginBlockStart).toBe(CLEARANCE + "px");
    expect(add.style.scrollMarginBlockEnd).toBe(128 + 12 + "px");
  });

  it("«تراجع» after a revealed deletion still restores the same question at its place, focused", async () => {
    await start();
    const before = h.latest!.sections[0].questions[1];
    geo["sb-q-q3"] = { top: 60, height: 300 };
    fireEvent.click(deleteBtn("q2"));
    fireEvent.click(screen.getByRole("button", { name: "تراجع عن حذف السؤال" }));
    await wait(5);
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    expect(h.latest!.sections[0].questions[1]).toBe(before);
    expect(document.activeElement).toBe(card("q2"));
  });

  it("Escape inside the toast returns focus to the neighbour without moving the page when it is on screen", async () => {
    await start();
    geo["sb-q-q2"] = { top: 400, height: 300 };
    fireEvent.click(deleteBtn("q3"));                                              // last card → previous neighbour q2
    const undo = screen.getByRole("button", { name: "تراجع عن حذف السؤال" });
    act(() => { undo.focus(); });
    scrollCalls = []; focusCalls = [];
    fireEvent.keyDown(undo, { key: "Escape" });
    expect(document.activeElement).toBe(card("q2"));
    expect(lastFocus("sb-q-q2")?.opts).toEqual({ preventScroll: true });
    expect(scrollCalls).toEqual([]);
  });
});

describe("21E.1 slice 2 RF1 (R1) — measured in Chromium: the toolbar's real bottom edge, and no pointless moves", () => {
  it("the clearance is the toolbar's BOTTOM edge + 12 px (the scroller's padding puts the sticky toolbar 16 px down), not its height", async () => {
    await start();
    geo.toolbar = { top: 16, height: 120 };                                         // bottom 136 → clearance 148 (height + 12 would be 132)
    geo["sb-q-q3"] = { top: 60, height: 300 };
    fireEvent.click(deleteBtn("q2"));
    expect(card("q3").style.scrollMarginBlockStart).toBe("148px");
  });
  it("when the toolbar and the toast band leave no usable strip (phone: toolbar 716 of 844 px), a heading just below the toolbar stays put", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    await start();
    geo.toolbar = { top: 16, height: 700 };                                         // bottom 716; the toast band starts at 716 too
    geo["sb-q-q3"] = { top: 724, height: 900 };
    fireEvent.click(deleteBtn("q2"));
    expect(document.activeElement).toBe(card("q3"));
    expect(lastFocus("sb-q-q3")?.opts).toEqual({ preventScroll: true });
    expect(scrollCalls).toEqual([]);
  });
});

describe("21E.1 slice 2 RF1 (R1) — focus after deleting a SECTION", () => {
  it("the next section's heading is on screen → focus with preventScroll, the page does not move", async () => {
    await start();
    geo["section-s2"] = { top: 300, height: 600 };
    fireEvent.click(within(sectionEl("s1")).getByRole("button", { name: "حذف القسم" }));
    expect(document.activeElement).toBe(sectionEl("s2"));
    expect(lastFocus("section-s2")?.opts).toEqual({ preventScroll: true });
    expect(scrollsOf("section-s2")).toEqual([]);
  });

  it("the next section's heading is under the sticky toolbar → revealed by its top just below it", async () => {
    await start();
    geo["section-s2"] = { top: 10, height: 600 };
    fireEvent.click(within(sectionEl("s1")).getByRole("button", { name: "حذف القسم" }));
    expect(document.activeElement).toBe(sectionEl("s2"));
    expect(scrollsOf("section-s2").pop()?.opts).toEqual({ block: "start", behavior: "smooth" });
    expect(sectionEl("s2").style.scrollMarginBlockStart).toBe(CLEARANCE + "px");
  });
});
