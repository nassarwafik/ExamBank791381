// @vitest-environment happy-dom
// Phase 21E.1 slice 2 — Review Fix 2 (the implementing window's own review of PR #300; not an independent approval). Contracts
// pinned here, with the geometry controlled per element (happy-dom has no layout) like the Review Fix 1 file:
//  1. A POINTER closing the toast (the browser focused its × on mousedown, so the toast reports focus inside) returns focus to the
//     neighbour WITHOUT moving the page, however far the teacher scrolled meanwhile; a KEYBOARD close reveals the neighbour only
//     when its heading is hidden. The same for the success toast after «تراجع» and for a pointer «تراجع» that is refused.
//  2. Every focus() on a target after a deletion carries preventScroll (a plain focus() before it would scroll).
//  3. The clearance of a reveal is the toolbar's RESTING stuck position (scroller padding + toolbar height + 12), never a lower
//     edge measured while the end of the scroll range pushed the stuck toolbar up.
//  4. The restored card after «تراجع» is centred only when it fits the area the success toast leaves (its band), else top-aligned;
//     the 24 px margin of the "fits" rule is exact.
//  5. A candidate that cannot take focus (an add button disabled while saving) is skipped; the last resort is the toolbar.
//  6. Toast copy: whole graphemes (harakat, emoji) in the shortened title, a word cut only in the second half, no empty «», the
//     title in <bdi>, Arabic counts for 100+ questions, the display number shortened in the visible text only.
// Fail-first on dd795f3 (the head reviewed by the self-review): the pointer / keyboard, resting-clearance, disabled-fallback, success
// toast, grapheme, empty-«» and count cases fail; the rest are pins.
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
const section = (id: string, title: string, questions: ReturnType<typeof Q>[]) => ({ id, title, gradingPolicy: "all", stimuli: {}, questions }) as unknown as StructuredExam["sections"][number];

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
const VIEW_H = 800, TOOLBAR_H = 120, PAD = 16, CLEARANCE = PAD + TOOLBAR_H + 12;
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
const sectionEl = (id: string) => document.querySelector(`[data-section-id="${id}"]`) as HTMLElement;
const toast = () => screen.queryByRole("group", { name: "إشعار" });
const message = () => (document.querySelector(".eb-toast .eb-toast-message") as HTMLElement).textContent ?? "";
const live = () => (document.querySelector(".eb-toast-layer [role='status']") as HTMLElement).textContent ?? "";
const deleteQuestion = (id: string) => fireEvent.click(within(card(id)).getByRole("button", { name: "حذف" }));
const deleteSection = (id: string) => fireEvent.click(within(sectionEl(id)).getByRole("button", { name: "حذف القسم" }));
const undoQuestion = () => screen.getByRole("button", { name: "تراجع عن حذف السؤال" });
const closeBtn = () => within(toast()!).getByRole("button", { name: "إغلاق الإشعار" });
const POINTER = { detail: 1 };                                             // a mouse / touch click (a keyboard activation has detail 0)
const hide = (key: string) => { geo[key] = { top: 900, height: 200 }; };   // below the viewport: the heading is hidden
const focusOn = (el: HTMLElement) => act(() => { el.focus(); });
const removeSectionS1 = () => act(() => h.update(e => ({ ...e, sections: e.sections.filter(s => s.id !== "s1") })));

describe("21E.1 slice 2 RF2 — a pointer closing the toast never scrolls the page; a keyboard close reveals a hidden target", () => {
  it("deletion toast, × with the POINTER while the neighbour is far away: focus on it with preventScroll, no scrollIntoView", async () => {
    await start();
    deleteQuestion("q2");
    hide("sb-q-q3");                                                         // the teacher scrolled on while the toast showed
    focusOn(closeBtn());                                                     // Chromium focuses a button on mousedown
    scrollCalls = []; focusCalls = [];
    fireEvent.click(closeBtn(), POINTER);
    expect(toast()).toBeNull();
    expect(document.activeElement).toBe(card("q3"));
    expect(focusCalls.filter(c => c.key === "sb-q-q3").map(c => c.opts)).toEqual([{ preventScroll: true }]);
    expect(scrollCalls).toEqual([]);
  });
  it("…the same close from the KEYBOARD reveals the hidden neighbour just below the resting toolbar (and not at all when visible)", async () => {
    await start();
    deleteQuestion("q2");
    hide("sb-q-q3");
    focusOn(closeBtn());
    scrollCalls = [];
    fireEvent.click(closeBtn());                                             // detail 0: Enter / Space
    expect(document.activeElement).toBe(card("q3"));
    expect(scrollCalls.map(c => [c.key, c.opts?.block, c.margin])).toEqual([["sb-q-q3", "center", CLEARANCE + "px"]]);
    cleanup();
    await start();
    deleteQuestion("q2");
    focusOn(closeBtn());
    scrollCalls = [];
    fireEvent.keyDown(closeBtn(), { key: "Escape" });
    expect(document.activeElement).toBe(card("q3"));
    expect(scrollCalls).toEqual([]);
  });
  it("success toast after «تراجع»: a pointer × never moves the page; Escape moves it only when the restored card is hidden", async () => {
    await start();
    deleteQuestion("q2");
    fireEvent.click(undoQuestion());
    await wait(5);
    expect(document.activeElement).toBe(card("q2"));
    hide("sb-q-q2");
    focusOn(closeBtn());
    scrollCalls = []; focusCalls = [];
    fireEvent.click(closeBtn(), POINTER);
    expect(document.activeElement).toBe(card("q2"));
    expect(scrollCalls).toEqual([]);
    expect(focusCalls.filter(c => c.key === "sb-q-q2").every(c => c.opts?.preventScroll)).toBe(true);
    cleanup();
    await start();
    deleteQuestion("q2");
    fireEvent.click(undoQuestion());
    await wait(5);
    hide("sb-q-q2");
    focusOn(closeBtn());
    scrollCalls = [];
    fireEvent.keyDown(closeBtn(), { key: "Escape" });
    expect(document.activeElement).toBe(card("q2"));
    expect(scrollCalls.map(c => [c.key, c.margin])).toEqual([["sb-q-q2", CLEARANCE + "px"]]);
  });
  it("a refused «تراجع» (its section gone): the POINTER leaves the page where it is, the KEYBOARD reveals «+ إضافة قسم»", async () => {
    for (const [click, scrolls] of [[POINTER, 0], [undefined, 1]] as const) {
      await start();
      deleteQuestion("q2");
      removeSectionS1();
      hide("add-section");
      focusOn(undoQuestion());
      scrollCalls = [];
      fireEvent.click(undoQuestion(), click);
      await wait(5);
      expect(message()).toBe("تعذّرت استعادة السؤال: القسم «القسم الأول» لم يعد موجودًا.");
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ إضافة قسم" }));
      expect(scrollCalls.length).toBe(scrolls);
      cleanup();
    }
  });
});

describe("21E.1 slice 2 RF2 — every focus after a deletion carries preventScroll; the reveal uses the toolbar's resting position", () => {
  it("no plain focus() ever reaches the neighbour, the add button or the section", async () => {
    await start();
    deleteQuestion("q2");
    deleteQuestion("q3");
    deleteQuestion("q1");                                                    // → «+ إضافة سؤال»
    deleteSection("s1");                                                     // → the next section
    const targets = focusCalls.filter(c => ["sb-q-q3", "sb-q-q1", "add-question-s1", "section-s2"].includes(c.key));
    expect(targets.length).toBeGreaterThanOrEqual(4);
    expect(targets.every(c => c.opts?.preventScroll === true)).toBe(true);
  });
  it("the end of the scroll range pushed the stuck toolbar up (its edge reads 36 px): the clearance is still padding + height + 12", async () => {
    await start();
    geo.toolbar = { top: -84, height: TOOLBAR_H };                           // displaced: bottom 36
    hide("sb-q-q3");
    deleteQuestion("q2");
    expect(scrollCalls.map(c => [c.key, c.margin])).toEqual([["sb-q-q3", CLEARANCE + "px"]]);
  });
  it("a toolbar lower than its resting place (the builder not yet scrolled) keeps the larger, measured clearance", async () => {
    await start();
    geo.toolbar = { top: 24, height: TOOLBAR_H };                            // bottom 144 > resting 136
    hide("sb-q-q3");
    deleteQuestion("q2");
    expect(scrollCalls.map(c => c.margin)).toEqual([144 + 12 + "px"]);
  });
  it("the clearance is measured inside the SCROLLER (its own top edge subtracted), never from the viewport", async () => {
    await start();
    geo.scroller = { top: 10, height: VIEW_H };
    geo.toolbar = { top: 40, height: TOOLBAR_H };                           // bottom 160 → 150 inside the scroller (> resting 136)
    hide("sb-q-q3");
    deleteQuestion("q2");
    expect(scrollCalls.map(c => c.margin)).toEqual([150 + 12 + "px"]);
  });
  it("without a scroller padding the resting position is the toolbar's height alone", async () => {
    await start(<Host scrollerPadding="0px" />);
    geo.toolbar = { top: -100, height: TOOLBAR_H };
    hide("sb-q-q3");
    deleteQuestion("q2");
    expect(scrollCalls.map(c => c.margin)).toEqual([TOOLBAR_H + 12 + "px"]);
  });
});

describe("21E.1 slice 2 RF2 — the restored card is centred only when it fits beside the success toast's band; the 24 px margin is exact", () => {
  const AREA_WITH_BAND = VIEW_H - 128 - CLEARANCE - 24;                      // 500
  it("after «تراجع» a card that fits the band-reduced area is centred, one 1 px taller is top-aligned", async () => {
    for (const [height, block] of [[AREA_WITH_BAND, "center"], [AREA_WITH_BAND + 1, "start"]] as const) {
      await start();
      deleteQuestion("q2");
      geo["sb-q-q2"] = { top: 900, height };
      fireEvent.click(undoQuestion());
      await wait(5);
      expect(toast()?.className).toContain("tone-success");
      expect(scrollCalls.filter(c => c.key === "sb-q-q2").map(c => c.opts?.block)).toEqual([block]);
      expect(focusCalls.filter(c => c.key === "sb-q-q2").every(c => c.opts?.preventScroll)).toBe(true);
      cleanup();
    }
  });
  it("a restored SECTION is focused with preventScroll too, and aligned by its top below the resting toolbar", async () => {
    await start();
    deleteSection("s1");
    hide("section-s1");
    fireEvent.click(screen.getByRole("button", { name: "تراجع عن حذف القسم" }));
    await wait(5);
    expect(document.activeElement).toBe(sectionEl("s1"));
    const calls = focusCalls.filter(c => c.key === "section-s1");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(c => c.opts?.preventScroll === true)).toBe(true);
    expect(scrollCalls.filter(c => c.key === "section-s1").map(c => [c.opts?.block, c.margin])).toEqual([["start", CLEARANCE + "px"]]);
  });
  it("after a deletion the same rule counts the band of the toast ABOUT to show", async () => {
    for (const [height, block] of [[AREA_WITH_BAND, "center"], [AREA_WITH_BAND + 1, "start"]] as const) {
      await start();
      geo["sb-q-q3"] = { top: 900, height };
      deleteQuestion("q2");
      expect(scrollCalls.filter(c => c.key === "sb-q-q3").map(c => c.opts?.block)).toEqual([block]);
      cleanup();
    }
  });
});

describe("21E.1 slice 2 RF2 — the history after «تراجع» never leaves focus on <body> (measured in Chromium)", () => {
  const key = (k: string, extra: object = {}) => fireEvent.keyDown(document.activeElement ?? document.body, { key: k, ctrlKey: true, bubbles: true, ...extra });
  it("Ctrl+Z right after «تراجع» re-deletes the focused card → its neighbour gets focus in place; Ctrl+Y brings it back focused", async () => {
    await start();
    deleteQuestion("q2");
    fireEvent.click(undoQuestion());
    await wait(5);
    expect(document.activeElement).toBe(card("q2"));
    scrollCalls = []; focusCalls = [];
    key("z");
    expect(h.latest!.sections[0].questions.map(q => q.examQuestionId)).toEqual(["q1", "q3"]);
    expect(document.activeElement).toBe(card("q3"));
    expect(focusCalls.map(c => [c.key, c.opts?.preventScroll])).toEqual([["sb-q-q3", true]]);
    expect(scrollCalls).toEqual([]);                                         // visible → no move
    key("y");
    expect(h.latest!.sections[0].questions.map(q => q.examQuestionId)).toEqual(["q1", "q2", "q3"]);
    expect(document.activeElement).toBe(card("q2"));
    expect(scrollCalls).toEqual([]);
  });
  it("…the same with ⌘Z / ⌘⇧Z, and for a restored SECTION (its neighbour section, then the section itself)", async () => {
    await start();
    deleteSection("s1");
    fireEvent.click(screen.getByRole("button", { name: "تراجع عن حذف القسم" }));
    await wait(5);
    expect(document.activeElement).toBe(sectionEl("s1"));
    fireEvent.keyDown(document.activeElement!, { key: "z", metaKey: true, bubbles: true });
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s2"]);
    expect(document.activeElement).toBe(sectionEl("s2"));
    fireEvent.keyDown(document.activeElement!, { key: "z", metaKey: true, shiftKey: true, bubbles: true });
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s1", "s2"]);
    expect(document.activeElement).toBe(sectionEl("s1"));
  });
  it("an unrelated exam change while focus is elsewhere never pulls focus to the restored item", async () => {
    await start();
    deleteQuestion("q2");
    fireEvent.click(undoQuestion());
    await wait(5);
    act(() => { (document.activeElement as HTMLElement).blur(); });
    expect(document.activeElement).toBe(document.body);
    act(() => h.update(e => ({ ...e, title: "عنوان آخر" })));
    expect(document.activeElement).toBe(document.body);
  });
});

describe("21E.1 slice 2 RF2 — a focus candidate disabled while saving is skipped; the toolbar is the last resort", () => {
  it("the only question of a section, toast closed during a save: the section gets focus (its add button is disabled)", async () => {
    await start(<Host initial={makeExam([section("s1", "القسم الأول", [Q("q1")]), section("s2", "القسم الثاني", [Q("r1")])])} />);
    deleteQuestion("q1");
    expect(document.activeElement).toBe(within(sectionEl("s1")).getByRole("button", { name: "+ إضافة سؤال" }));
    act(() => h.setSaving(true));
    focusOn(closeBtn());
    fireEvent.keyDown(closeBtn(), { key: "Escape" });
    expect(document.activeElement).toBe(sectionEl("s1"));
  });
  it("the last section, toast closed during a save: the toolbar (never disabled) gets focus, without any scroll", async () => {
    await start(<Host initial={makeExam([section("s1", "القسم الأول", [Q("q1")])])} />);
    deleteSection("s1");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ إضافة قسم" }));
    act(() => h.setSaving(true));
    focusOn(closeBtn());
    scrollCalls = [];
    fireEvent.click(closeBtn(), POINTER);
    expect(document.activeElement).toBe(document.querySelector(".sb-toolbar"));
    expect(scrollCalls).toEqual([]);
  });
});

describe("21E.1 slice 2 RF2 — toast copy", () => {
  const shown = () => (document.querySelector(".eb-toast bdi") as HTMLElement | null)?.textContent ?? null;
  const withTitle = (title: string) => makeExam([section("s1", title, [Q("q1"), Q("q2")]), section("s2", "ب", [Q("r1")])]);
  it("the shown section title is in <bdi> (a Latin title keeps its own direction, so its «…» stays at ITS end); the announcement is plain", async () => {
    await start(<Host initial={withTitle("Physics Unit 1 — Forces and Motion: Newton's Laws Review")} />);
    deleteQuestion("q2");
    expect(shown()).toBe("Physics Unit 1 — Forces and Motion:…");
    expect(message()).toBe("تم حذف السؤال 2 من «Physics Unit 1 — Forces and Motion:…».");
    await wait(80);
    expect(live()).toBe("تم حذف السؤال 2 من «Physics Unit 1 — Forces and Motion: Newton's Laws Review». للتراجع اضغط Ctrl+Z (أو ⌘Z) أو استخدم زر «تراجع».");
  });
  it("exactly 40 graphemes are shown whole; 41 are cut; a word cut only when the last space is in the second half (NBSP counts)", async () => {
    const forty = "أ".repeat(40), fortyOne = "أ".repeat(41);
    await start(<Host initial={withTitle(forty)} />); deleteQuestion("q2"); expect(shown()).toBe(forty); cleanup();
    await start(<Host initial={withTitle(fortyOne)} />); deleteQuestion("q2"); expect(shown()).toBe(forty + "…"); cleanup();
    await start(<Host initial={withTitle("أ".repeat(19) + " " + "ب".repeat(30))} />); deleteQuestion("q2"); expect(shown()).toBe("أ".repeat(19) + " " + "ب".repeat(20) + "…"); cleanup();
    await start(<Host initial={withTitle("أ".repeat(20) + " " + "ب".repeat(30))} />); deleteQuestion("q2"); expect(shown()).toBe("أ".repeat(20) + "…"); cleanup();
    await start(<Host initial={withTitle("أ".repeat(25) + " " + "ب".repeat(30))} />); deleteQuestion("q2"); expect(shown()).toBe("أ".repeat(25) + "…");
  });
  it("a vocalised title counts graphemes: 37 letters with harakat (50+ code points) are shown in full; a cut keeps the last letter's shadda", async () => {
    const vocalised = "سُورَةُ الْبَقَرَةِ: تَفْسِيرُ الْآيَاتِ مِنْ ١ إِلَى ٢٠";
    await start(<Host initial={withTitle(vocalised)} />); deleteQuestion("q2"); expect(shown()).toBe(vocalised); cleanup();
    const stacked = "دِّ".repeat(45);
    await start(<Host initial={withTitle(stacked)} />); deleteQuestion("q2"); expect(shown()).toBe("دِّ".repeat(40) + "…");
  });
  it("an emoji sequence or a flag at the cut is never split, and no format character is left before «…»", async () => {
    await start(<Host initial={withTitle("ق".repeat(39) + "👨‍👩‍👧‍👦" + "ق".repeat(5))} />); deleteQuestion("q2"); expect(shown()).toBe("ق".repeat(39) + "👨‍👩‍👧‍👦…"); cleanup();
    await start(<Host initial={withTitle("ق".repeat(39) + "🇸🇦" + "ق".repeat(5))} />); deleteQuestion("q2"); expect(shown()).toBe("ق".repeat(39) + "🇸🇦…"); cleanup();
    await start(<Host initial={withTitle("ق".repeat(39) + "‏" + "ق".repeat(5))} />); deleteQuestion("q2"); expect(shown()).toBe("ق".repeat(39) + "…");
  });
  it("a whitespace-only title falls back to «القسم N» in every toast; a question of such a section is named without « »", async () => {
    await start(<Host initial={withTitle("   ")} />);
    deleteQuestion("q2");
    expect(message()).toBe("تم حذف السؤال 2.");
    deleteSection("s1");
    expect(message()).toBe("تم حذف «القسم 1» مع سؤال واحد.");
    fireEvent.click(screen.getByRole("button", { name: "تراجع عن حذف القسم" }));
    await wait(5);
    expect(message()).toBe("تمت استعادة «القسم 1».");
  });
  it("a refused restore names the missing section without empty « »", async () => {
    await start(<Host initial={withTitle("")} />);
    deleteQuestion("q2");
    removeSectionS1();
    fireEvent.click(undoQuestion());
    await wait(5);
    expect(message()).toBe("تعذّرت استعادة السؤال: قسمه لم يعد موجودًا.");
  });
  it("Arabic question counts: 1, 2, 3–10, 11–99, and 100+ by the last two digits", async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => Q("m" + i));
    for (const [n, phrase] of [[1, "سؤال واحد"], [2, "سؤالين"], [10, "10 أسئلة"], [11, "11 سؤالًا"], [100, "100 سؤال"], [103, "103 أسئلة"]] as const) {
      await start(<Host initial={makeExam([section("s1", "أ", many(n)), section("s2", "ب", [Q("r1")])])} />);
      deleteSection("s1");
      expect(message()).toBe("تم حذف «أ» مع " + phrase + ".");
      cleanup();
    }
  }, 60000);
  it("a long display number is shortened in the visible toast only (24 graphemes); the announcement keeps it", async () => {
    const label = "السؤال الأول من الجزء الثاني حول الشبكات المحلية";
    await start(<Host initial={makeExam([section("s1", "أ", [Q("q1"), Q("q2", "نص", label)]), section("s2", "ب", [Q("r1")])])} />);
    deleteQuestion("q2");
    expect(message()).toBe("تم حذف السؤال السؤال الأول من الجزء… من «أ».");
    await wait(80);
    expect(live()).toContain("تم حذف السؤال " + label + " من «أ».");
  });
  it("the success toast after «تراجع» lives at most 4 s even when the undo toast lives 10 s", () => {
    vi.useFakeTimers();
    try {
      render(<Host />);
      act(() => { vi.advanceTimersByTime(10); });
      deleteQuestion("q2");
      fireEvent.click(undoQuestion());
      act(() => { vi.advanceTimersByTime(1); });
      expect(toast()?.className).toContain("tone-success");
      act(() => { vi.advanceTimersByTime(3990); });
      expect(toast()).not.toBeNull();
      act(() => { vi.advanceTimersByTime(20); });
      expect(toast()).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it("TOAST_BAND and the CSS reserve are the same number (16 px × 2 + 96)", () => {
    const tokens = readFileSync(path.join(process.cwd(), "src", "design-tokens.css"), "utf8");
    const space4 = parseFloat(/--eb-space-4:\s*(\d+)px/.exec(tokens)![1]);
    const source = readFileSync(path.join(process.cwd(), "src", "StructuredExamBuilder.tsx"), "utf8");
    expect(parseInt(/const TOAST_BAND = (\d+);/.exec(source)![1], 10)).toBe(space4 * 2 + 96);
  });
});
