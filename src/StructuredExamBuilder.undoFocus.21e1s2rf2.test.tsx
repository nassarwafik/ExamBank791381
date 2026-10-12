// @vitest-environment happy-dom
// PR #300 SELF-REVIEW (not an independent approval) — adversarial tests that try to BREAK Review Fix 1 (R1: focus after a
// deletion never hides the heading under the sticky toolbar, never moves the page when the target is visible) and the safe
// «تراجع» (one new history entry, never a pop, never a duplicate). They mount the REAL StructuredExamBuilder with the REAL
// history hook (the App.tsx wiring), control layout per element (happy-dom has no layout), and after EVERY scenario check
// that keyboard focus sits on a connected, enabled, focusable element inside the builder (never <body>).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { StrictMode, useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam } from "./examTypes";
import type { StructuredExamUpdater } from "./examBuilderState";

const Q = (id: string, text: string) => ({ examQuestionId: id, presentationType: "shortAnswer", text, marks: 2, answer: { text: "x" } });
const makeExam = (): StructuredExam => ({
  examId: "ex1", title: "امتحان الوحدة", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [
    { id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions: [Q("q1", "الأول"), Q("q2", "الثاني"), Q("q3", "الثالث")] },
    { id: "s2", title: "القسم الثاني", gradingPolicy: "all", stimuli: {}, questions: [Q("r1", "سؤال القسم الثاني"), Q("r2", "سؤال أخير")] },
  ],
} as unknown as StructuredExam);
const singleLastSection = (): StructuredExam => { const e = makeExam(); e.sections[1] = { ...e.sections[1], questions: [e.sections[1].questions[0]] }; return e; };

type Handles = { latest: StructuredExam | null; past: number; update: (u: StructuredExamUpdater) => void; undo: () => void; setSaving: (v: boolean) => void; open: (e: StructuredExam) => void };
const h = {} as Handles;
function Host({ initial, toastMs }: { initial?: StructuredExam; toastMs?: number }) {
  const hist = useStructuredExamHistory();
  const [saving, setSaving] = useState(false);
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial ?? makeExam(), "saved"); } }, [hist, initial]);
  useEffect(() => { Object.assign(h, { latest: hist.present, past: hist.history.past.length, update: hist.update, undo: hist.undo, setSaving, open: (e: StructuredExam) => hist.open(e, "saved") }); }, [hist]);
  if (!hist.present) return null;
  return (
    <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving}
      onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo}
      saveState={examSaveState(hist.history, saving)} backupStorage={null} undoToastMs={toastMs} />
  );
}

// ── controlled layout: viewport 800 px, sticky toolbar 0–120 px; every other element is VISIBLE (top 300) unless overridden ──
const VIEW_H = 800;
type Box = { top: number; height: number };
let geo: Record<string, Box> = {};
const keyOf = (el: Element) => (el.classList.contains("sb-toolbar") ? "toolbar" : el.id ? el.id
  : (el as HTMLElement).dataset?.sectionId ? "section-" + (el as HTMLElement).dataset.sectionId
  : el.hasAttribute("data-add-question") ? "add-question-" + (el.closest("[data-section-id]") as HTMLElement | null)?.dataset.sectionId
  : el.hasAttribute("data-add-section") ? "add-section" : el.tagName.toLowerCase());
let focusCalls: { key: string; opts: unknown; connected: boolean; at: number }[] = [];
let scrollCalls: { key: string; opts: unknown; connected: boolean; at: number }[] = [];
let tick = 0;
const original = { focus: HTMLElement.prototype.focus, scroll: HTMLElement.prototype.scrollIntoView, matchMedia: window.matchMedia };
beforeEach(() => {
  geo = { toolbar: { top: 0, height: 120 } };
  focusCalls = []; scrollCalls = []; tick = 0;
  Object.defineProperty(window, "innerHeight", { configurable: true, value: VIEW_H });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const b = geo[keyOf(this)] ?? { top: 300, height: 200 };
    return { top: b.top, bottom: b.top + b.height, height: b.height, left: 0, right: 640, width: 640, x: 0, y: b.top, toJSON() {} } as DOMRect;
  });
  HTMLElement.prototype.focus = function (this: HTMLElement, opts?: FocusOptions) { focusCalls.push({ key: keyOf(this), opts, connected: this.isConnected, at: ++tick }); return original.focus.call(this, opts); };
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, opts?: boolean | ScrollIntoViewOptions) { scrollCalls.push({ key: keyOf(this), opts, connected: this.isConnected, at: ++tick }); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); HTMLElement.prototype.focus = original.focus; HTMLElement.prototype.scrollIntoView = original.scroll; window.matchMedia = original.matchMedia; });

const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const sectionEl = (id: string) => document.querySelector(`[data-section-id="${id}"]`) as HTMLElement;
const ids = (sid = "s1") => h.latest!.sections.find(s => s.id === sid)?.questions.map(q => q.examQuestionId);
const allIds = () => h.latest!.sections.flatMap(s => s.questions.map(q => q.examQuestionId));
const toast = () => screen.queryByRole("group", { name: "إشعار" });
const toasts = () => screen.queryAllByRole("group", { name: "إشعار" });
const live = () => document.querySelector(".eb-toast-layer [role='status']") as HTMLElement;
const deleteBtn = (id: string) => within(card(id)).getByRole("button", { name: "حذف" });
const deleteQuestion = (id: string) => fireEvent.click(deleteBtn(id));
const deleteSection = (id: string) => fireEvent.click(within(sectionEl(id)).getByRole("button", { name: "حذف القسم" }));
const undoQuestion = () => screen.getByRole("button", { name: "تراجع عن حذف السؤال" }) as HTMLButtonElement;
const undoSection = () => screen.getByRole("button", { name: "تراجع عن حذف القسم" }) as HTMLButtonElement;
const closeBtn = () => within(toast()!).getByRole("button", { name: "إغلاق الإشعار" });
const addSectionBtn = () => screen.getByRole("button", { name: "+ إضافة قسم" });
const addQuestionBtn = (sid: string) => within(sectionEl(sid)).getByRole("button", { name: "+ إضافة سؤال" });
const ctrlZ = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "z", ctrlKey: true, bubbles: true });
const start = async (ui: React.ReactElement = <Host />) => { const r = render(ui); await wait(5); focusCalls = []; scrollCalls = []; return r; };

/** "" when focus is on a connected, enabled, focusable element inside the builder; otherwise what is wrong. */
const focusProblem = (): string => {
  const a = document.activeElement as HTMLElement | null;
  if (!a || a === document.body || a === document.documentElement) return "focus fell to <body>";
  if (!a.isConnected) return "focus on a detached node";
  if (!a.closest(".sb-builder")) return "focus outside the builder: <" + a.tagName.toLowerCase() + ">";
  if ((a as HTMLButtonElement).disabled) return "focus on a disabled control «" + (a.textContent || "").trim() + "»";
  if (!a.matches("button, input, select, textarea, a[href], [tabindex]")) return "focus on a non-focusable <" + a.tagName.toLowerCase() + ">";
  return "";
};
const noDuplicates = () => { const all = allIds(); expect(new Set(all).size).toBe(all.length); };
const noDetachedCalls = () => {
  expect(focusCalls.filter(c => !c.connected)).toEqual([]);
  expect(scrollCalls.filter(c => !c.connected)).toEqual([]);
};

describe("SELF-REVIEW — the last question of the last section", () => {
  it("deleting the LAST question of the LAST section focuses the previous card in place; «تراجع» puts it back at the end", async () => {
    await start();
    const before = h.latest!.sections[1].questions[1];
    deleteQuestion("r2");
    expect(ids("s2")).toEqual(["r1"]);
    expect(document.activeElement).toBe(card("r1"));
    expect(focusCalls.filter(c => c.key === "sb-q-r1").pop()?.opts).toEqual({ preventScroll: true });
    expect(scrollCalls).toEqual([]);                                                // the target is visible → the page does not move
    expect(focusProblem()).toBe("");
    fireEvent.click(undoQuestion());
    await wait(5);
    expect(ids("s2")).toEqual(["r1", "r2"]);
    expect(h.latest!.sections[1].questions[1]).toBe(before);
    expect(document.activeElement).toBe(card("r2"));
    expect(focusProblem()).toBe("");
    noDuplicates(); noDetachedCalls();
  });

  it("the ONLY question of the last section → «+ إضافة سؤال» in place; «تراجع» → the card again", async () => {
    await start(<Host initial={singleLastSection()} />);
    deleteQuestion("r1");
    expect(document.activeElement).toBe(addQuestionBtn("s2"));
    expect(scrollCalls).toEqual([]);
    expect(focusProblem()).toBe("");
    fireEvent.click(undoQuestion());
    await wait(5);
    expect(ids("s2")).toEqual(["r1"]);
    expect(document.activeElement).toBe(card("r1"));
    expect(focusProblem()).toBe("");
    noDuplicates(); noDetachedCalls();
  });

  it("deleting the last section, then the only remaining one → previous section, then «+ إضافة قسم»; «تراجع» restores only the newest", async () => {
    await start();
    deleteSection("s2");
    expect(document.activeElement).toBe(sectionEl("s1"));
    expect(scrollCalls).toEqual([]);
    expect(focusProblem()).toBe("");
    deleteSection("s1");
    expect(h.latest!.sections).toEqual([]);
    expect(document.activeElement).toBe(addSectionBtn());
    expect(scrollCalls).toEqual([]);
    expect(focusProblem()).toBe("");
    expect(toasts()).toHaveLength(1);
    fireEvent.click(undoSection());
    await wait(5);
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s1"]);
    expect(document.activeElement).toBe(sectionEl("s1"));
    expect(focusProblem()).toBe("");
    noDuplicates(); noDetachedCalls();
  });
});

describe("SELF-REVIEW — a second deletion while the first toast is up, then «تراجع» on the newer toast", () => {
  it("restores ONLY the newer deletion, as one entry; history stays linear and duplicate-free through three Ctrl+Z", async () => {
    await start();
    deleteQuestion("q1");
    const pastAfterFirst = h.past;
    deleteQuestion("q2");
    expect(toasts()).toHaveLength(1);
    expect(toast()!.textContent).toContain("تم حذف السؤال 1 من «القسم الأول».");      // the number the teacher saw on q2 at that moment
    expect(document.activeElement).toBe(card("q3"));
    expect(scrollCalls).toEqual([]);
    expect(h.past).toBe(pastAfterFirst + 1);
    fireEvent.click(undoQuestion());
    await wait(5);
    expect(ids()).toEqual(["q2", "q3"]);
    expect(h.past).toBe(pastAfterFirst + 2);
    expect(document.activeElement).toBe(card("q2"));
    expect(focusProblem()).toBe("");
    expect(screen.queryByRole("button", { name: "تراجع عن حذف السؤال" })).toBeNull();
    act(() => h.undo()); expect(ids()).toEqual(["q3"]);                            // undo the restore
    act(() => h.undo()); expect(ids()).toEqual(["q2", "q3"]);                      // undo deletion 2
    act(() => h.undo()); expect(ids()).toEqual(["q1", "q2", "q3"]);                // undo deletion 1
    noDuplicates(); noDetachedCalls();
  });

  it("deleting the card that just received focus (the first deletion's neighbour) → the previous card; «تراجع» brings back only it", async () => {
    await start();
    deleteQuestion("q2");
    expect(document.activeElement).toBe(card("q3"));
    const btn = deleteBtn("q3");
    act(() => { btn.focus(); });
    fireEvent.click(btn);
    expect(document.activeElement).toBe(card("q1"));
    expect(focusProblem()).toBe("");
    fireEvent.click(undoQuestion());
    await wait(5);
    expect(ids()).toEqual(["q1", "q3"]);
    expect(document.activeElement).toBe(card("q3"));
    noDuplicates(); noDetachedCalls();
  });
});

describe("SELF-REVIEW — deleting a section whose question has focus", () => {
  it("focus inside a question's field, the section is deleted (pointer: focus stays put) → the next section, no scroll; «تراجع» → same section object", async () => {
    await start();
    const field = card("q1").querySelector<HTMLElement>("input, textarea")!;
    act(() => { field.focus(); });
    expect(document.activeElement).toBe(field);
    const before = h.latest!.sections[0];
    deleteSection("s1");
    expect(field.isConnected).toBe(false);
    expect(document.activeElement).toBe(sectionEl("s2"));
    expect(scrollCalls).toEqual([]);
    expect(focusProblem()).toBe("");
    fireEvent.click(undoSection());
    await wait(5);
    expect(h.latest!.sections[0]).toBe(before);
    expect(document.activeElement).toBe(sectionEl("s1"));
    expect(focusProblem()).toBe("");
    noDuplicates(); noDetachedCalls();
  });
  it("same from the keyboard (focus on «حذف القسم» inside the section) → the next section", async () => {
    await start();
    const del = within(sectionEl("s1")).getByRole("button", { name: "حذف القسم" });
    act(() => { del.focus(); });
    fireEvent.click(del);
    expect(document.activeElement).toBe(sectionEl("s2"));
    expect(focusProblem()).toBe("");
    noDetachedCalls();
  });
});

describe("SELF-REVIEW — delete → Ctrl+Z → «تراجع» never duplicates", () => {
  it("Ctrl+Z right after the deletion restores it and removes the toast (no second restore possible)", async () => {
    await start();
    deleteQuestion("q2");
    ctrlZ();
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    expect(toast()).toBeNull();
    expect(screen.queryByRole("button", { name: "تراجع عن حذف السؤال" })).toBeNull();
    expect(focusProblem()).toBe("");
    noDuplicates();
  });
  it("Ctrl+Z and a click on «تراجع» in the SAME batch: the item comes back exactly once", async () => {
    await start();
    deleteQuestion("q2");
    const undoBtn = undoQuestion();
    const past = h.past;
    act(() => {
      (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
      undoBtn.click();
    });
    await wait(5);
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    noDuplicates();
    expect(h.past).toBe(past - 1);                                                 // only the history undo moved; the restore was a no-op
    expect(screen.queryByRole("button", { name: "تراجع عن حذف السؤال" })).toBeNull();
    expect(focusProblem()).toBe("");
    noDetachedCalls();
  });
  it("Ctrl+Z inside the toast, then a click on the (now detached) «تراجع» does nothing", async () => {
    await start();
    deleteQuestion("q2");
    const undoBtn = undoQuestion();
    act(() => { undoBtn.focus(); });
    fireEvent.keyDown(undoBtn, { key: "z", ctrlKey: true, bubbles: true });
    expect(undoBtn.isConnected).toBe(false);
    const snapshot = h.latest; const past = h.past;
    act(() => { undoBtn.click(); });
    expect(h.latest).toBe(snapshot);
    expect(h.past).toBe(past);
    expect(document.activeElement).toBe(card("q2"));
    expect(focusProblem()).toBe("");
    noDuplicates(); noDetachedCalls();
  });
  it("«تراجع», then Ctrl+Z twice (undo the restore, undo the deletion): q2 exists exactly once", async () => {
    await start();
    deleteQuestion("q2");
    fireEvent.click(undoQuestion());
    await wait(5);
    ctrlZ();
    expect(ids()).toEqual(["q1", "q3"]);
    expect(focusProblem()).not.toBe("focus on a detached node");
    ctrlZ();
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    noDuplicates();
  });
});

describe("SELF-REVIEW — edits made after the deletion survive «تراجع»", () => {
  it("title, a neighbour's text and another section's question all keep their edits; the restored object is the original one", async () => {
    await start();
    const before = h.latest!.sections[0].questions[1];
    deleteQuestion("q2");
    fireEvent.change(screen.getByPlaceholderText("عنوان الامتحان المنظّم"), { target: { value: "عنوان جديد" } });
    act(() => h.update(e => ({ ...e, sections: e.sections.map(s => ({ ...s, questions: s.questions.map(q => (q.examQuestionId === "q3" || q.examQuestionId === "r1" ? { ...q, text: "معدّل" } : q)) })) })));
    const past = h.past;
    fireEvent.click(undoQuestion());
    await wait(5);
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    expect(h.latest!.sections[0].questions[1]).toBe(before);
    expect(h.latest!.title).toBe("عنوان جديد");
    expect((h.latest!.sections[0].questions[2] as { text?: string }).text).toBe("معدّل");
    expect((h.latest!.sections[1].questions[0] as { text?: string }).text).toBe("معدّل");
    expect(h.past).toBe(past + 1);
    expect(focusProblem()).toBe("");
    noDuplicates();
  });
});

describe("SELF-REVIEW — saving", () => {
  it("while saving: every delete button and the toast action are disabled, Ctrl+Z is held; afterwards «تراجع» works once", async () => {
    await start();
    deleteQuestion("q2");
    act(() => h.setSaving(true));
    expect((deleteBtn("q1") as HTMLButtonElement).disabled).toBe(true);
    expect((within(sectionEl("s1")).getByRole("button", { name: "حذف القسم" }) as HTMLButtonElement).disabled).toBe(true);
    expect(undoQuestion().disabled).toBe(true);
    fireEvent.click(undoQuestion());
    ctrlZ();
    expect(ids()).toEqual(["q1", "q3"]);
    expect(toast()).not.toBeNull();
    act(() => h.setSaving(false));
    fireEvent.click(undoQuestion());
    await wait(5);
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    expect(focusProblem()).toBe("");
    noDuplicates();
  });
  it("while saving, Escape inside the toast hands focus to the neighbour CARD (focusable while saving)", async () => {
    await start();
    deleteQuestion("q2");
    act(() => h.setSaving(true));
    const close = closeBtn();
    act(() => { close.focus(); });
    fireEvent.keyDown(close, { key: "Escape" });
    expect(toast()).toBeNull();
    expect(document.activeElement).toBe(card("q3"));
    expect(focusProblem()).toBe("");
  });
  it("while saving, Escape inside the toast after deleting the ONLY question of a section never drops focus («+ إضافة سؤال» is disabled then)", async () => {
    await start(<Host initial={singleLastSection()} />);
    deleteQuestion("r1");
    expect(document.activeElement).toBe(addQuestionBtn("s2"));
    act(() => h.setSaving(true));
    const close = closeBtn();
    act(() => { close.focus(); });
    fireEvent.keyDown(close, { key: "Escape" });
    expect(toast()).toBeNull();
    expect(focusProblem()).toBe("");
  });
  it("while saving, closing the toast (×, focus inside) after deleting the LAST section never drops focus («+ إضافة قسم» is disabled then)", async () => {
    await start();
    deleteSection("s2");
    deleteSection("s1");
    expect(document.activeElement).toBe(addSectionBtn());
    act(() => h.setSaving(true));
    const close = closeBtn();
    act(() => { close.focus(); });
    fireEvent.click(close);
    expect(toast()).toBeNull();
    expect(focusProblem()).toBe("");
  });
});

describe("SELF-REVIEW — unmounting while a focus / reveal is pending", () => {
  it("«تراجع» (question) then an immediate unmount: no throw, no focus or scroll on a detached node, no React error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await start();
    deleteQuestion("q2");
    fireEvent.click(undoQuestion());                                               // the focus on the restored card is scheduled (0 ms)
    const mark = tick;
    expect(() => r.unmount()).not.toThrow();
    await wait(40);
    expect(focusCalls.filter(c => c.at > mark)).toEqual([]);
    expect(scrollCalls.filter(c => c.at > mark)).toEqual([]);
    noDetachedCalls();
    expect(err).not.toHaveBeenCalled();
  });
  it("«تراجع» (section) then an immediate unmount: same", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await start();
    deleteSection("s1");
    fireEvent.click(undoSection());
    const mark = tick;
    expect(() => r.unmount()).not.toThrow();
    await wait(40);
    expect(focusCalls.filter(c => c.at > mark)).toEqual([]);
    expect(scrollCalls.filter(c => c.at > mark)).toEqual([]);
    expect(err).not.toHaveBeenCalled();
  });
  it("unmount while focus is INSIDE the deletion toast and its short countdown is pending: no onDismiss focus move afterwards", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await start(<Host toastMs={30} />);
    deleteQuestion("q2");
    act(() => { undoQuestion().focus(); });
    const mark = tick;
    expect(() => r.unmount()).not.toThrow();
    await wait(80);
    expect(focusCalls.filter(c => c.at > mark)).toEqual([]);
    expect(err).not.toHaveBeenCalled();
  });
});

describe("SELF-REVIEW — StrictMode (double effects / double updaters)", () => {
  it("one deletion = one toast, one history entry, one announcement; «تراجع» restores once; focus lands correctly", async () => {
    await start(<StrictMode><Host /></StrictMode>);
    const before = h.latest!.sections[0].questions[1];
    const past = h.past;
    deleteQuestion("q2");
    expect(ids()).toEqual(["q1", "q3"]);
    expect(h.past).toBe(past + 1);
    expect(toasts()).toHaveLength(1);
    expect(document.activeElement).toBe(card("q3"));
    expect(scrollCalls).toEqual([]);
    await wait(80);
    expect(live().textContent).toBe("تم حذف السؤال 2 من «القسم الأول». للتراجع اضغط Ctrl+Z (أو ⌘Z) أو استخدم زر «تراجع».");
    fireEvent.click(undoQuestion());
    await wait(5);
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    expect(h.latest!.sections[0].questions[1]).toBe(before);
    expect(h.past).toBe(past + 2);
    expect(toasts()).toHaveLength(1);
    expect(document.activeElement).toBe(card("q2"));
    expect(focusProblem()).toBe("");
    noDuplicates(); noDetachedCalls();
  });
  it("section deletion + Escape inside the toast under StrictMode → the next section, deletion kept", async () => {
    await start(<StrictMode><Host /></StrictMode>);
    deleteSection("s1");
    expect(document.activeElement).toBe(sectionEl("s2"));
    act(() => { undoSection().focus(); });
    fireEvent.keyDown(undoSection(), { key: "Escape" });
    expect(toast()).toBeNull();
    expect(document.activeElement).toBe(sectionEl("s2"));
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s2"]);
    expect(focusProblem()).toBe("");
  });
});

describe("SELF-REVIEW — Escape in the toast after the neighbour was itself deleted (another route: bulk delete / external edit)", () => {
  const escapeInToast = () => { const u = undoQuestion(); act(() => { u.focus(); }); scrollCalls = []; fireEvent.keyDown(u, { key: "Escape" }); };
  it("next neighbour gone → the previous card, in place", async () => {
    await start();
    deleteQuestion("q2");
    act(() => h.update(e => ({ ...e, sections: e.sections.map(s => ({ ...s, questions: s.questions.filter(q => q.examQuestionId !== "q3") })) })));
    escapeInToast();
    expect(toast()).toBeNull();
    expect(document.activeElement).toBe(card("q1"));
    expect(scrollCalls).toEqual([]);
    expect(focusProblem()).toBe("");
  });
  it("both neighbours gone → «+ إضافة سؤال» of the section", async () => {
    await start();
    deleteQuestion("q2");
    act(() => h.update(e => ({ ...e, sections: e.sections.map(s => ({ ...s, questions: s.questions.filter(q => q.examQuestionId !== "q1" && q.examQuestionId !== "q3") })) })));
    escapeInToast();
    expect(document.activeElement).toBe(addQuestionBtn("s1"));
    expect(scrollCalls).toEqual([]);
    expect(focusProblem()).toBe("");
  });
  it("the whole section gone → «+ إضافة قسم»; a later «تراجع» would have been refused, never a crash", async () => {
    await start();
    deleteQuestion("q2");
    act(() => h.update(e => ({ ...e, sections: e.sections.filter(s => s.id !== "s1") })));
    escapeInToast();
    expect(document.activeElement).toBe(addSectionBtn());
    expect(focusProblem()).toBe("");
  });
  it("a deleted SECTION whose neighbour section was removed meanwhile → «+ إضافة قسم»", async () => {
    await start();
    deleteSection("s1");
    act(() => h.update(e => ({ ...e, sections: e.sections.filter(s => s.id !== "s2") })));
    const u = undoSection();
    act(() => { u.focus(); });
    fireEvent.keyDown(u, { key: "Escape" });
    expect(document.activeElement).toBe(addSectionBtn());
    expect(focusProblem()).toBe("");
  });
  it("the neighbour deleted through the toast path (toast replaced) → Escape goes to the NEW deletion's neighbour", async () => {
    await start();
    deleteQuestion("q2");
    deleteQuestion("q3");
    escapeInToast();
    expect(document.activeElement).toBe(card("q1"));
    expect(ids()).toEqual(["q1"]);
    expect(focusProblem()).toBe("");
  });
});

describe("SELF-REVIEW — odd geometry", () => {
  it("a zero-height neighbour that is positioned on screen is focused in place (no scroll)", async () => {
    await start();
    geo["sb-q-q3"] = { top: 300, height: 0 };
    deleteQuestion("q2");
    expect(document.activeElement).toBe(card("q3"));
    expect(scrollCalls).toEqual([]);
    expect(focusProblem()).toBe("");
  });
  it("an all-zero rect (the display:none signature) is treated as off-screen: ONE centred reveal request just below the toolbar (a no-op in a browser), focus still lands", async () => {
    await start();
    geo["sb-q-q3"] = { top: 0, height: 0 };
    deleteQuestion("q2");
    expect(document.activeElement).toBe(card("q3"));
    expect(scrollCalls.map(c => [c.key, c.opts])).toEqual([["sb-q-q3", { block: "center", behavior: "smooth" }]]);
    expect(card("q3").style.scrollMarginBlockStart).toBe("132px");
    expect(focusProblem()).toBe("");
  });
  it("no sticky toolbar in the DOM: a visible neighbour stays put, a hidden one is revealed with a 12 px clearance; nothing throws", async () => {
    const qs = Element.prototype.querySelector;
    vi.spyOn(Element.prototype, "querySelector").mockImplementation(function (this: Element, sel: string) { return sel === ".sb-toolbar" ? null : qs.call(this, sel); });
    await start();
    geo["sb-q-q3"] = { top: 20, height: 300 };
    deleteQuestion("q2");
    expect(document.activeElement).toBe(card("q3"));
    expect(scrollCalls).toEqual([]);
    geo["sb-q-q1"] = { top: -200, height: 300 };
    deleteQuestion("q3");
    expect(document.activeElement).toBe(card("q1"));
    expect(scrollCalls.filter(c => c.key === "sb-q-q1")).toHaveLength(1);
    expect(card("q1").style.scrollMarginBlockStart).toBe("12px");
    expect(focusProblem()).toBe("");
  });
  it("a toolbar with an all-zero rect (hidden) behaves like no toolbar", async () => {
    await start();
    geo.toolbar = { top: 0, height: 0 };
    geo["sb-q-q3"] = { top: 20, height: 300 };
    deleteQuestion("q2");
    expect(scrollCalls).toEqual([]);
    expect(document.activeElement).toBe(card("q3"));
  });
});

describe("SELF-REVIEW — toasts leaving after a restore, and a double activation of «تراجع»", () => {
  it("closing the SUCCESS toast (Escape, focus inside) while the restored card is on screen does not move the page (RF1: no pointless moves when a toast leaves)", async () => {
    await start();
    deleteQuestion("q2");
    fireEvent.click(undoQuestion());
    await wait(5);
    expect(document.activeElement).toBe(card("q2"));
    const close = closeBtn();
    act(() => { close.focus(); });
    scrollCalls = []; focusCalls = [];
    fireEvent.keyDown(close, { key: "Escape" });
    expect(toast()).toBeNull();
    expect(document.activeElement).toBe(card("q2"));
    expect(focusProblem()).toBe("");
    expect(scrollCalls.map(c => [c.key, c.opts])).toEqual([]);
  });
  it("closing the SUCCESS toast of a restored SECTION (×, focus inside) while the section heading is on screen does not move the page", async () => {
    await start();
    deleteSection("s1");
    fireEvent.click(undoSection());
    await wait(5);
    expect(document.activeElement).toBe(sectionEl("s1"));
    const close = closeBtn();
    act(() => { close.focus(); });
    scrollCalls = [];
    fireEvent.click(close);
    expect(toast()).toBeNull();
    expect(document.activeElement).toBe(sectionEl("s1"));
    expect(focusProblem()).toBe("");
    expect(scrollCalls.map(c => [c.key, c.opts])).toEqual([]);
  });
  it("a double activation of «تراجع» in one batch restores ONCE (one history entry, no duplicate id)", async () => {
    await start();
    deleteQuestion("q2");
    const btn = undoQuestion();
    const past = h.past;
    act(() => { btn.click(); btn.click(); });
    await wait(5);
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    expect(h.past).toBe(past + 1);
    noDuplicates();
    expect(toasts()).toHaveLength(1);
    expect(document.activeElement).toBe(card("q2"));
    expect(focusProblem()).toBe("");
  });
  it("SYNTHETIC (two clicks in ONE JS task — not reachable by real user input): a double activation of «حذف» on a section in one batch still offers one «تراجع» and moves focus", async () => {
    await start();
    const del = within(sectionEl("s1")).getByRole("button", { name: "حذف القسم" });
    const past = h.past;
    act(() => { del.click(); del.click(); });
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s2"]);
    expect(h.past).toBe(past + 1);
    expect(toasts()).toHaveLength(1);
    expect(focusProblem()).toBe("");
    fireEvent.click(undoSection());
    await wait(5);
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s1", "s2"]);
    noDuplicates();
  });
});

describe("SELF-REVIEW — the toast leaving for other reasons while focus is inside / just left it", () => {
  it("another exam opens while focus is inside the toast → the toast leaves and focus lands inside the NEW exam's builder (never <body>)", async () => {
    await start();
    deleteQuestion("q2");
    act(() => { undoQuestion().focus(); });
    const other = makeExam(); other.examId = "ex2";
    other.sections = [{ ...other.sections[1], id: "t1", questions: [Q("z1", "سؤال آخر")] }] as StructuredExam["sections"];
    act(() => h.open(other));
    await wait(5);
    expect(toast()).toBeNull();
    expect(h.latest!.examId).toBe("ex2");
    expect(focusProblem()).toBe("");
  });
  it("Ctrl+Z inside the toast when a LATER edit is the newest history entry undoes that edit only; the toast and focus stay; «تراجع» still restores", async () => {
    await start();
    deleteQuestion("q2");
    act(() => h.update(e => ({ ...e, title: "عنوان لاحق" })));
    const u = undoQuestion();
    act(() => { u.focus(); });
    fireEvent.keyDown(u, { key: "z", ctrlKey: true, bubbles: true });
    expect(h.latest!.title).toBe("امتحان الوحدة");
    expect(ids()).toEqual(["q1", "q3"]);
    expect(toast()).not.toBeNull();
    expect(document.activeElement).toBe(u);
    fireEvent.click(u);
    await wait(5);
    expect(ids()).toEqual(["q1", "q2", "q3"]);
    expect(focusProblem()).toBe("");
    noDuplicates();
  });
  it("focus leaves the toast (Tab back to a card) and the toast then times out → focus is NOT moved again", async () => {
    await start(<Host toastMs={60} />);
    deleteQuestion("q2");
    const u = undoQuestion();
    act(() => { u.focus(); });
    act(() => { card("q1").focus(); });                                            // the user moved on
    focusCalls = [];
    await wait(160);
    expect(toast()).toBeNull();
    expect(document.activeElement).toBe(card("q1"));
    expect(focusCalls).toEqual([]);
    expect(ids()).toEqual(["q1", "q3"]);
  });
});
