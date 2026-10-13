// @vitest-environment happy-dom
//
// Phase 21E.2 part 2 — Review Fix 3, confirmed audit findings about the builder's sticky layers, through the REAL
// StructuredExamBuilder + REAL history hook inside a replica of App's overlay (role=dialog, aria-modal; the K2 wrapper):
//   A-01  the bulk-action bar and the inline question explorer stick BELOW the stuck 21E.2 toolbar: the builder publishes the
//         toolbar's height as --sb-toolbar-band (kept current by a ResizeObserver) and builder-toolbar.css offsets both layers by it
//         (they kept 64 / 76 px offsets sized for the old toolbar and slid under it — every bulk control hit-tested to the toolbar in
//         Chromium). A target revealed while questions are selected clears the bar too (it would otherwise land under it).
//   A-02  where the toolbar is static (phones, 200 %: builder-toolbar.css), a heading is on screen only below the SCROLLER's top:
//         the scrolled-away toolbar's bottom edge (thousands of px above the screen) made every heading above the screen count as
//         visible, so a deletion / Ctrl+Y put focus on a card nobody could see (Chromium: top −934 / bottom −4 at 640 × 450).
// happy-dom has no layout and no stylesheet: geometry is controlled per element; computed `position` / `top` are mocked.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, act, screen, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";

const sq = (id: string, text: string): BuilderQuestion => ({ examQuestionId: id, presentationType: "shortAnswer", text, marks: 2, answer: { text: "-" } } as unknown as BuilderQuestion);
const makeExam = (): StructuredExam => ({ examId: "exA", title: "امتحان الطبقات", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [
    { id: "s1", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [sq("q1", "ما هو الراوتر"), sq("q2", "ما هو المبدّل"), sq("q3", "ما هو الجسر"), sq("q4", "ما هو الموزّع")] },
    { id: "s2", title: "التوجيه", gradingPolicy: "all", stimuli: {}, questions: [sq("q5", "ما هو البروتوكول")] },
  ] } as unknown as StructuredExam);

const h = {} as { update: (fn: (e: StructuredExam) => StructuredExam) => void };
function Host() {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(makeExam(), "saved"); } }, [hist]);
  useEffect(() => { h.update = hist.update; }, [hist]);
  if (!hist.present) return null;
  return (
    <div className="structured-builder-overlay" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="sb-builder-title" tabIndex={-1} style={{ paddingTop: "16px" }}>
      <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} onUndo={hist.undo} onRedo={hist.redo}
        canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} onExit={() => {}} />
    </div>
  );
}

// ── controlled layout: a 640 × 450 viewport (200 % zoom); the scroller starts at 0 with 16 px of top padding ──
const VIEW_H = 450, PAD = 16;
type Box = { top: number; height: number };
let geo: Record<string, Box> = {};
let toolbarPosition = "static";
let bulk: { position: string; top: string } = { position: "", top: "" };
const keyOf = (el: Element) => (el.classList.contains("sb-toolbar") ? "toolbar" : el.classList.contains("structured-builder-overlay") ? "scroller"
  : el.classList.contains("sb-bulk-bar") ? "bulk" : (el as HTMLElement).dataset?.sectionId ? "section-" + (el as HTMLElement).dataset.sectionId : el.id || "");
let scrollCalls: { key: string; opts: ScrollIntoViewOptions | undefined; margin: string }[] = [];
const original = { scroll: HTMLElement.prototype.scrollIntoView, matchMedia: window.matchMedia, getComputedStyle: window.getComputedStyle, ResizeObserver: globalThis.ResizeObserver };
beforeEach(() => {
  toolbarPosition = "static";
  bulk = { position: "", top: "" };
  geo = { toolbar: { top: PAD, height: 96 }, scroller: { top: 0, height: VIEW_H } };
  scrollCalls = [];
  Object.defineProperty(window, "innerHeight", { configurable: true, value: VIEW_H });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const b = geo[keyOf(this)] ?? { top: 200, height: 120 };
    return { top: b.top, bottom: b.top + b.height, height: b.height, left: 0, right: 640, width: 640, x: 0, y: b.top, toJSON() {} } as DOMRect;
  });
  vi.spyOn(window, "getComputedStyle").mockImplementation(function (el: Element, pseudo?: string | null) {
    const cs = original.getComputedStyle.call(window, el, pseudo);
    const over: Record<string, string> | null = !(el instanceof HTMLElement) ? null : el.classList.contains("sb-toolbar") ? { position: toolbarPosition }
      : el.classList.contains("sb-bulk-bar") ? { position: bulk.position, top: bulk.top } : null;
    if (!over) return cs;
    return new Proxy(cs, { get: (t, p) => (typeof p === "string" && p in over ? over[p] : typeof Reflect.get(t, p) === "function" ? (Reflect.get(t, p) as (...a: unknown[]) => unknown).bind(t) : Reflect.get(t, p)) });
  });
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, opts?: boolean | ScrollIntoViewOptions) { scrollCalls.push({ key: keyOf(this), opts: opts as ScrollIntoViewOptions, margin: this.style.scrollMarginBlockStart }); };
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks();
  HTMLElement.prototype.scrollIntoView = original.scroll; window.matchMedia = original.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original.ResizeObserver;
});

const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const mount = async () => { render(<Host />); await tick(); scrollCalls = []; };
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const deleteQuestion = (id: string) => fireEvent.click(within(card(id)).getByRole("button", { name: "حذف" }));
const key = (k: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key: k, ctrlKey: true, bubbles: true });
const sectionEl = (id: string) => document.querySelector<HTMLElement>(`[data-section-id="${id}"]`)!;
const summaryEntry = (target: RegExp) => Array.from(document.querySelectorAll<HTMLElement>(".sb-issues-list .sb-issue-link")).find(b => target.test(b.textContent || ""))!;

describe("A-02 — a static toolbar that scrolled away never makes a hidden heading count as on screen", () => {
  // The toolbar scrolled away with the content (static: 640 × 450 / phone), its bottom edge far above the screen.
  const scrolledAway = () => { geo.toolbar = { top: -3700, height: 96 }; };

  it("deleting the last question of a section focuses its previous card AND reveals it 12 px below the scroller's top (Chromium: −934 / −4)", async () => {
    await mount();
    scrolledAway();
    geo["sb-q-q4"] = { top: 12, height: 930 };                          // the deleted card is at the top of the screen
    geo["sb-q-q3"] = { top: -934, height: 930 };                        // its previous neighbour is wholly above the screen
    deleteQuestion("q4");
    await tick();
    expect(document.activeElement).toBe(card("q3"));
    const reveal = scrollCalls.filter(c => c.key === "sb-q-q3");
    expect(reveal).toHaveLength(1);
    expect(reveal[0].opts).toMatchObject({ block: "start" });           // taller than the screen: aligned by its top
    expect(reveal[0].margin).toBe("12px");                              // K2 C-F4: a static toolbar keeps only the 12 px
  });

  it("Ctrl+Y that brings a deleted question back focuses it AND reveals it when it is above the screen", async () => {
    await mount();
    deleteQuestion("q2");
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "تراجع عن حذف السؤال" }));
    await tick(20);
    expect(document.activeElement).toBe(card("q2"));
    key("z");                                                           // undo the restore: q2 leaves, focus goes to its neighbour
    await tick(20);
    expect(card("q2")).toBeNull();
    expect(document.activeElement).toBe(card("q3"));
    scrolledAway();
    geo["sb-q-q3"] = { top: 12, height: 930 };
    geo["sb-q-q2"] = { top: -934, height: 930 };                        // where q2 comes back: above the screen
    scrollCalls = [];
    key("y");                                                           // redo the restore: q2 is back and takes focus
    await tick(20);
    expect(document.activeElement).toBe(card("q2"));
    const reveal = scrollCalls.filter(c => c.key === "sb-q-q2");
    expect(reveal.length).toBeGreaterThanOrEqual(1);
    expect(reveal[0].margin).toBe("12px");
  });

  it("pin: a neighbour already on screen below the scroller's top is focused in place (no scroll), with the static toolbar scrolled away", async () => {
    await mount();
    scrolledAway();
    geo["sb-q-q4"] = { top: 300, height: 120 };
    geo["sb-q-q3"] = { top: 120, height: 160 };
    deleteQuestion("q4");
    await tick();
    expect(document.activeElement).toBe(card("q3"));
    expect(scrollCalls.filter(c => c.key === "sb-q-q3")).toEqual([]);
  });

  it("pin: with a STICKY toolbar a heading under it is still revealed and one below it still stays put (PR #300 contract)", async () => {
    toolbarPosition = "sticky";
    await mount();
    geo.toolbar = { top: PAD, height: 120 };                            // stuck band 16–136
    geo["sb-q-q4"] = { top: 300, height: 120 };
    geo["sb-q-q3"] = { top: 60, height: 160 };                          // its heading is under the toolbar
    deleteQuestion("q4");
    await tick();
    expect(document.activeElement).toBe(card("q3"));
    expect(scrollCalls.filter(c => c.key === "sb-q-q3")).toHaveLength(1);
    scrollCalls = [];
    geo["sb-q-q2"] = { top: 160, height: 120 };                         // below the toolbar: visible
    deleteQuestion("q3");
    await tick();
    expect(document.activeElement).toBe(card("q2"));
    expect(scrollCalls).toEqual([]);
  });
});

describe("A-01 — the layers that stick below the toolbar", () => {
  it("the builder publishes the stuck toolbar's height as --sb-toolbar-band and keeps it current (ResizeObserver)", async () => {
    let notify: (() => void) | null = null;
    const observed: Element[] = [];
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      constructor(cb: () => void) { notify = cb; }
      observe(el: Element) { observed.push(el); }
      unobserve() {}
      disconnect() { notify = null; }
    };
    geo.toolbar = { top: PAD, height: 118.6 };
    await mount();
    const builder = document.querySelector<HTMLElement>(".sb-builder")!;
    expect(builder.style.getPropertyValue("--sb-toolbar-band")).toBe("119px");
    expect(observed).toEqual([document.querySelector(".sb-toolbar")]);
    geo.toolbar = { top: PAD, height: 160 };                            // the toolbar wrapped to another row
    await act(async () => { notify?.(); });
    expect(builder.style.getPropertyValue("--sb-toolbar-band")).toBe("160px");
    cleanup();
    expect(notify).toBeNull();                                          // disconnected with the builder
  });

  it("builder-toolbar.css offsets the bulk-action bar and the inline explorer by the band, only where the toolbar is sticky, out-ranking the old fixed offsets", () => {
    const css = readFileSync(resolve(__dirname, "builder-toolbar.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const sticky = css.match(/@media \(min-width: 768px\) and \(min-height: 600px\) \{([\s\S]*?)\n\}/);
    expect(sticky).toBeTruthy();
    const block = sticky![1];
    const rule = (sel: string) => block.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}"))?.[1] ?? "(no rule)";
    const bar = rule(".sb-builder .sb-bulk-bar"), nav = rule(".sb-builder .sb-workspace > .sb-navigator");
    expect(bar).toMatch(/inset-block-start:\s*calc\(var\(--sb-toolbar-band, 0px\) \+ var\(--eb-space-2\)\)/);
    expect(nav).toMatch(/inset-block-start:\s*calc\(var\(--sb-toolbar-band, 0px\) \+ var\(--eb-space-2\)\)/);
    expect(nav).toMatch(/max-block-size:\s*calc\(100vh - var\(--sb-toolbar-band, 0px\)/);
    // structured-builder.css keeps `.sb-bulk-bar{top:64px}` / `.sb-navigator{top:76px}` (0-1-0): the new selectors are 0-2-0 / 0-3-0.
    const old = readFileSync(resolve(__dirname, "../structured-builder.css"), "utf8");
    expect(old).toMatch(/\.sb-bulk-bar\{position:sticky;top:64px/);
    expect(old).toMatch(/\.sb-navigator\{[^}]*position:sticky;top:76px/);
  });

  it("while the bulk-action bar sticks below the toolbar, a revealed section clears the bar too (it would land under it)", async () => {
    toolbarPosition = "sticky";
    geo.toolbar = { top: PAD, height: 119 };                            // stuck band 16–135
    await mount();
    fireEvent.click(within(card("q5")).getByRole("checkbox", { name: "تحديد السؤال" }));
    await tick();
    expect(document.querySelector(".sb-bulk-bar")).not.toBeNull();
    bulk = { position: "sticky", top: "127px" };                        // builder-toolbar.css: band 119 + 8
    geo.bulk = { top: 143, height: 53 };                                // stuck: 143–196
    h.update(e => ({ ...e, sections: e.sections.map(s => (s.id === "s2" ? { ...s, gradingPolicy: "capScore" } : s)) }));   // a section-level issue
    await tick();
    fireEvent.click(summaryEntry(/القسم 2/));
    await tick();
    expect(sectionEl("s2").style.scrollMarginBlockStart).toBe(PAD + 127 + 53 + 12 + "px");
  });

  it("while the bulk-action bar is stuck, a focused card whose heading is under the bar is revealed (not left under it)", async () => {
    toolbarPosition = "sticky";
    geo.toolbar = { top: PAD, height: 119 };
    await mount();
    fireEvent.click(within(card("q1")).getByRole("checkbox", { name: "تحديد السؤال" }));
    await tick();
    bulk = { position: "sticky", top: "127px" };
    geo.bulk = { top: 143, height: 53 };
    geo["sb-q-q4"] = { top: 300, height: 120 };
    geo["sb-q-q3"] = { top: 150, height: 160 };                         // below the toolbar (135) but under the bar (143–196)
    deleteQuestion("q4");
    await tick();
    expect(document.activeElement).toBe(card("q3"));
    const reveal = scrollCalls.filter(c => c.key === "sb-q-q3");
    expect(reveal).toHaveLength(1);
    expect(reveal[0].margin).toBe(PAD + 127 + 53 + 12 + "px");
  });

  it("pin: without a sticky bulk bar the clearance is the toolbar's resting band (no selection: unchanged)", async () => {
    toolbarPosition = "sticky";
    geo.toolbar = { top: PAD, height: 119 };
    await mount();
    h.update(e => ({ ...e, sections: e.sections.map(s => (s.id === "s2" ? { ...s, gradingPolicy: "capScore" } : s)) }));
    await tick();
    fireEvent.click(summaryEntry(/القسم 2/));
    await tick();
    expect(sectionEl("s2").style.scrollMarginBlockStart).toBe(PAD + 119 + 12 + "px");
  });
});

describe("RR3-A11Y-2 / B-02 — a Tab never leaves keyboard focus under the sticky layers (WCAG 2.4.11)", () => {
  // Chromium does not scroll a focus stop that is "in view" behind a sticky bar, and scrolls one above the screen only to the
  // scroller's top — under the same bars (measured: 8 / 45 Shift+Tab stops fully hidden at 1280 × 900 with a selection). The builder
  // moves the scroller after a Tab so the control sits 12 px below the sticky layers' edge.
  let scrollTop = 1000;
  const scroller = () => document.querySelector<HTMLElement>(".structured-builder-overlay")!;
  const trackScroll = () => {
    scrollTop = 1000;
    Object.defineProperty(scroller(), "scrollTop", { configurable: true, get: () => scrollTop, set: (v: number) => { scrollTop = v; } });
  };
  /** One Tab from a control inside the builder (never <body>: the overlay's Tab trap would move focus itself) to `el`. */
  const tabTo = (el: HTMLElement, shift = true) => act(() => {
    card("q5").focus();
    fireEvent.keyDown(card("q5"), { key: "Tab", shiftKey: shift, bubbles: true });
    el.focus();
  });
  it("a control under the stuck toolbar (top 60, toolbar bottom 136) is brought 12 px below it; one below the edge is left in place", async () => {
    toolbarPosition = "sticky";
    geo.toolbar = { top: PAD, height: 120 };
    await mount();
    trackScroll();
    geo["sb-q-q2"] = { top: 60, height: 100 };
    await tabTo(card("q2"));
    expect(scrollTop).toBe(1000 - (136 - 60 + 12));
    expect(document.activeElement).toBe(card("q2"));
    scrollTop = 1000;
    geo["sb-q-q3"] = { top: 200, height: 100 };
    await tabTo(card("q3"), false);
    expect(scrollTop).toBe(1000);
  });
  it("with a selection the edge is the stuck bulk-action bar's bottom (143–196): a control at 150 goes to 208", async () => {
    toolbarPosition = "sticky";
    geo.toolbar = { top: PAD, height: 119 };
    await mount();
    fireEvent.click(within(card("q5")).getByRole("checkbox", { name: "تحديد السؤال" }));
    await tick();
    bulk = { position: "sticky", top: "127px" };
    geo.bulk = { top: 143, height: 53 };
    trackScroll();
    geo["sb-q-q1"] = { top: 150, height: 100 };
    await tabTo(card("q1"));
    expect(scrollTop).toBe(1000 - (196 - 150 + 12));
  });
  it("where the toolbar is static (200 %, phones) a control above the scroller's top is brought 12 px below it", async () => {
    await mount();
    trackScroll();
    geo["sb-q-q2"] = { top: -300, height: 100 };
    await tabTo(card("q2"));
    expect(scrollTop).toBe(1000 - 312);
  });
  it("pin: programmatic focus (no Tab) is never adjusted — the reveals place it themselves", async () => {
    toolbarPosition = "sticky";
    geo.toolbar = { top: PAD, height: 120 };
    await mount();
    trackScroll();
    geo["sb-q-q2"] = { top: 60, height: 100 };
    act(() => { card("q2").focus(); });
    expect(scrollTop).toBe(1000);
  });
  it("pin: a control inside a sticky layer (the toolbar's own buttons) never scrolls the content", async () => {
    toolbarPosition = "sticky";
    geo.toolbar = { top: PAD, height: 120 };
    await mount();
    trackScroll();
    const inToolbar = document.querySelector<HTMLElement>(".sb-toolbar button:not([disabled])")!;
    await tabTo(inToolbar);
    expect(document.activeElement).toBe(inToolbar);
    expect(scrollTop).toBe(1000);
  });
});
