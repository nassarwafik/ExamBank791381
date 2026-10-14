// @vitest-environment happy-dom
//
// Phase 21E.2 part 2 — review cluster K2, through the REAL StructuredExamBuilder + REAL history hook inside a replica of App's
// overlay (role=dialog, aria-modal, named by the toolbar heading — the same wrapper as inlineIssuesWiring.21e2b):
//   C-F1  Escape in the question explorer's search box «بحث في الامتحان» clears the search (native) and keeps the builder: no
//         exit, no unsaved-changes guard, not default-prevented. Escape on a question card still exits.
//   C-F4  The clearance a reveal keeps above its target follows the toolbar's REAL positioning. builder-toolbar.css makes the
//         toolbar static below 768 × 600 (phones, 200 % zoom): it scrolls away with the content and can never cover a target
//         below it, so a reveal keeps only the 12 px margin — it used to reserve the toolbar's whole height (+ the scroller's
//         padding), landing every reveal ~270 px low on a phone. A sticky toolbar keeps its resting-band clearance (PR #300).
// happy-dom has no layout and no stylesheet: geometry is controlled per element and the toolbar's computed `position` is mocked.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, act, screen, within } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import { toolbarItem } from "./builder/toolbarTestActions";
import type { StructuredExam, BuilderQuestion } from "./examTypes";

const sq = (id: string, text: string): BuilderQuestion => ({ examQuestionId: id, presentationType: "shortAnswer", text, marks: 2, answer: { text: "-" } } as unknown as BuilderQuestion);
// s2 is empty (EMPTY_SECTION: a section-level summary entry «القسم 2»); q3 has no text (a question-level entry).
const makeExam = (): StructuredExam => ({ examId: "ex1", title: "امتحان الشبكات", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [
    { id: "s1", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [sq("q1", "ما هو الراوتر"), sq("q2", "ما هو المبدّل"), sq("q3", "")] },
    { id: "s2", title: "فارغ", gradingPolicy: "all", stimuli: {}, questions: [] },
  ] } as unknown as StructuredExam);

const onExit = vi.fn();
function Host() {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(makeExam(), "saved"); } }, [hist]);
  if (!hist.present) return null;
  return (
    <div className="structured-builder-overlay" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="sb-builder-title" tabIndex={-1} style={{ paddingTop: "16px" }}>
      <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} onUndo={hist.undo} onRedo={hist.redo}
        canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} onExit={onExit} />
    </div>
  );
}

// ── controlled layout: a phone-sized viewport (844 px); the scroller starts at 0 with 16 px of top padding; the toolbar is 270 px
// tall and, scrolled to the top, sits 16 px down (bottom 286) — the phone toolbar of the 21E.2 builder at 390 × 844 ──
const VIEW_H = 844, PAD = 16, TOOLBAR_H = 270, RESTING = PAD + TOOLBAR_H + 12;
type Box = { top: number; height: number };
let geo: Record<string, Box> = {};
let toolbarPosition = "static";
const keyOf = (el: Element) => (el.classList.contains("sb-toolbar") ? "toolbar" : el.classList.contains("structured-builder-overlay") ? "scroller"
  : (el as HTMLElement).dataset?.sectionId ? "section-" + (el as HTMLElement).dataset.sectionId : el.id || "");
let scrollCalls: { key: string; opts: ScrollIntoViewOptions | undefined; margin: string }[] = [];
const original = { scroll: HTMLElement.prototype.scrollIntoView, matchMedia: window.matchMedia, getComputedStyle: window.getComputedStyle };
beforeEach(() => {
  onExit.mockReset();
  toolbarPosition = "static";
  geo = { toolbar: { top: PAD, height: TOOLBAR_H }, scroller: { top: 0, height: VIEW_H } };
  scrollCalls = [];
  Object.defineProperty(window, "innerHeight", { configurable: true, value: VIEW_H });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const b = geo[keyOf(this)] ?? { top: 1200, height: 160 };
    return { top: b.top, bottom: b.top + b.height, height: b.height, left: 0, right: 390, width: 390, x: 0, y: b.top, toJSON() {} } as DOMRect;
  });
  // The toolbar's computed position is what builder-toolbar.css gives it at this viewport ("" = no stylesheet, as in PR #300's tests).
  vi.spyOn(window, "getComputedStyle").mockImplementation(function (el: Element, pseudo?: string | null) {
    const cs = original.getComputedStyle.call(window, el, pseudo);
    if (!(el instanceof HTMLElement) || !el.classList.contains("sb-toolbar")) return cs;
    return new Proxy(cs, { get: (t, p) => (p === "position" ? toolbarPosition : typeof Reflect.get(t, p) === "function" ? (Reflect.get(t, p) as (...a: unknown[]) => unknown).bind(t) : Reflect.get(t, p)) });
  });
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, opts?: boolean | ScrollIntoViewOptions) { scrollCalls.push({ key: keyOf(this), opts: opts as ScrollIntoViewOptions, margin: this.style.scrollMarginBlockStart }); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); HTMLElement.prototype.scrollIntoView = original.scroll; window.matchMedia = original.matchMedia; });

const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const mount = async () => { render(<Host />); await tick(); scrollCalls = []; };
const sectionEl = (id: string) => document.querySelector<HTMLElement>(`[data-section-id="${id}"]`)!;
const summaryEntry = (target: RegExp) => Array.from(document.querySelectorAll<HTMLElement>(".sb-issues-list .sb-issue-link")).find(b => target.test(b.textContent || ""))!;

describe("C-F1 — Escape in the question explorer's search box", () => {
  it("clears the search natively and keeps the builder (no exit, no guard, not default-prevented); Escape on a card still exits", async () => {
    await mount();
    fireEvent.click(toolbarItem("مستكشف الأسئلة"));
    const search = screen.getByRole("searchbox", { name: "بحث في الامتحان" });
    fireEvent.change(search, { target: { value: "راوتر" } });
    search.focus();
    const notPrevented = fireEvent.keyDown(search, { key: "Escape" });
    await tick();
    expect(notPrevented).toBe(true);
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /تغييرات غير محفوظة/ })).toBeNull();
    expect(document.querySelector(".sb-builder")).not.toBeNull();

    const card = document.getElementById("sb-q-q1") as HTMLElement;
    card.focus();
    expect(fireEvent.keyDown(card, { key: "Escape" })).toBe(false);
    await tick();
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe("C-F4 — a reveal's clearance follows the toolbar's real positioning", () => {
  it("static toolbar (phone / 200 %): a summary entry reveals its section with a 12 px margin, not the toolbar's height", async () => {
    await mount();
    fireEvent.click(summaryEntry(/القسم 2/));
    const call = scrollCalls.find(c => c.key === "section-s2");
    expect(call?.opts).toMatchObject({ block: "start" });
    expect(sectionEl("s2").style.scrollMarginBlockStart).toBe("12px");
    // K3 A-F4 — focus lands on the section's NAMED issue list «مشكلات القسم 2», inside the revealed section (no longer the unnamed section).
    expect(document.activeElement).toBe(sectionEl("s2").querySelector('.sb-section-head > [role="group"][aria-label="مشكلات القسم 2"]'));
    expect(sectionEl("s2").contains(document.activeElement)).toBe(true);
  });

  it("static toolbar: a question entry reveals its first invalid field with the 12 px margin too (the field fits → centred)", async () => {
    await mount();
    fireEvent.click(summaryEntry(/السؤال 3 في القسم 1/));
    await tick();
    const field = within(document.getElementById("sb-q-q3") as HTMLElement).getByLabelText("نص السؤال");
    const frame = (field.closest(".eb-field, .eb-field-group") ?? field) as HTMLElement;
    expect(frame.style.scrollMarginBlockStart).toBe("12px");
    expect(scrollCalls.find(c => c.margin === "12px")?.opts).toMatchObject({ block: "center" });
    expect(document.activeElement).toBe(field);
  });

  it("sticky toolbar (≥ 768 × 600): the resting band stays reserved (scroller padding + toolbar height + 12) — PR #300 contract", async () => {
    toolbarPosition = "sticky";
    await mount();
    fireEvent.click(summaryEntry(/القسم 2/));
    expect(sectionEl("s2").style.scrollMarginBlockStart).toBe(RESTING + "px");
  });

  it("sticky toolbar pushed up at the end of the scroll range: still the resting band (never the lower measured edge)", async () => {
    toolbarPosition = "sticky";
    await mount();
    geo.toolbar = { top: -100, height: TOOLBAR_H };
    fireEvent.click(summaryEntry(/القسم 2/));
    expect(sectionEl("s2").style.scrollMarginBlockStart).toBe(RESTING + "px");
  });
});
