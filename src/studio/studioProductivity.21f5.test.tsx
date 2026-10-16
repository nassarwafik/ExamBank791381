// @vitest-environment happy-dom
//
// Phase 21F.5 — Studio productivity through the REAL builder + history hook: the insert bar (a question at an exact place), keyboard
// shortcuts (Ctrl+Enter, Alt+↑/↓, Ctrl+D, Ctrl+K, ?), drag-and-drop in the outline (pointer and Alt+↑/↓ on a row) and the command
// palette. Every change is ONE history step and is announced.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, createEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import type { StructuredExam } from "../examTypes";

const tf = (id: string, text: string) => ({ examQuestionId: id, presentationType: "trueFalse", marks: 1, text, answer: { correct: true } });
const exam = (): StructuredExam => ({ examId: "E-P", title: "إنتاجية", status: "draft", sections: [
  { id: "s1", title: "الأول", gradingPolicy: "all", stimuli: {}, questions: [tf("q1", "عبارة DNS"), tf("q2", "عبارة DHCP")] },
  { id: "s2", title: "الثاني", gradingPolicy: "all", stimuli: {}, questions: [tf("q3", "عبارة OSI")] }
] } as unknown as StructuredExam);

const hist: { current: ReturnType<typeof useStructuredExamHistory> | null } = { current: null };
function Host() {
  const h = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; h.open(exam(), "saved"); } }, [h]);
  useEffect(() => { hist.current = h; });
  if (!h.present) return null;
  return <StructuredExamBuilder exam={h.present} onChange={h.update} onUndo={h.undo} onRedo={h.redo} canUndo={h.canUndo} canRedo={h.canRedo} layout="studio" onSave={() => {}} />;
}
beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia; });
afterEach(() => cleanup());

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const order = () => hist.current!.present!.sections.map(s => s.questions.map(q => q.examQuestionId));
const live = () => document.querySelector("[data-studio-live]")?.textContent ?? "";
const key = (target: Element, k: string, mods: Partial<KeyboardEventInit> = {}) => act(async () => { fireEvent.keyDown(target, { key: k, bubbles: true, ...mods }); });
async function openStudio() {
  render(<Host />);
  await screen.findByRole("tree", { name: "الأقسام والأسئلة" });
  await settle();
}
async function activate(id: string) {
  await act(async () => { fireEvent.click(card(id).querySelector(".st-card-cover")!); });
  await settle();
}

describe("21F.5 the insert bar", () => {
  it("«+» between two cards adds a question of a quick type at THAT place, as one step, and opens it", async () => {
    await openStudio();
    const steps = hist.current!.history.past.length;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "إضافة سؤال في الموضع 2 من القسم 1" })); });
    const menu = screen.getByRole("group", { name: "إضافة سؤال في الموضع 2 من القسم 1" });
    await act(async () => { fireEvent.click(within(menu).getByRole("button", { name: "اختيار من متعدد" })); });
    await settle();
    const s1 = hist.current!.present!.sections[0].questions;
    expect(s1.map(q => q.presentationType)).toEqual(["trueFalse", "multipleChoice", "trueFalse"]);
    expect(hist.current!.history.past.length).toBe(steps + 1);
    expect(document.querySelector(".st-card.is-active")?.id).toBe("sb-q-" + s1[1].examQuestionId);
    expect(screen.queryByRole("group", { name: /إضافة سؤال في الموضع/ })).toBeNull();
  });
  it("«كل الأنواع…» opens the type palette for that place", async () => {
    await openStudio();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "إضافة سؤال في الموضع 1 من القسم 2" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "كل الأنواع…" })); });
    expect(await screen.findByRole("dialog", { name: "إضافة سؤال" })).toBeTruthy();
  });
});

describe("21F.5 keyboard", () => {
  it("Ctrl+Enter opens the insert bar right after the open card", async () => {
    await openStudio();
    await activate("q1");
    await key(card("q1"), "Enter", { ctrlKey: true });
    expect(screen.getByRole("group", { name: "إضافة سؤال في الموضع 2 من القسم 1" })).toBeTruthy();
  });
  it("Alt+↓ moves the open card one place, then across the section boundary, and says where it went", async () => {
    await openStudio();
    await activate("q1");
    await key(card("q1"), "ArrowDown", { altKey: true });
    expect(order()).toEqual([["q2", "q1"], ["q3"]]);
    expect(live()).toBe("نُقل السؤال إلى الموضع 2 في القسم 1.");
    await key(card("q1"), "ArrowDown", { altKey: true });
    expect(order()).toEqual([["q2"], ["q1", "q3"]]);
    expect(live()).toBe("نُقل السؤال إلى الموضع 1 في القسم 2.");
  });
  it("Ctrl+D duplicates the open card", async () => {
    await openStudio();
    await activate("q2");
    await key(card("q2"), "d", { ctrlKey: true });
    expect(order()[0]).toHaveLength(3);
    expect(order()[0].slice(0, 2)).toEqual(["q1", "q2"]);
  });
  it("? opens the shortcuts list (outside text fields only)", async () => {
    await openStudio();
    await key(card("q1"), "?");
    expect(await screen.findByRole("dialog", { name: "اختصارات لوحة المفاتيح" })).toBeTruthy();
  });
});

describe("21F.5 drag-and-drop in the outline", () => {
  const row = (id: string) => document.querySelector<HTMLElement>('[data-outline-question="' + id + '"]')!;
  it("a row dragged onto another row lands next to it (one step) and the move is announced", async () => {
    await openStudio();
    const steps = hist.current!.history.past.length;
    await act(async () => { fireEvent.dragStart(row("q1"), { dataTransfer: { setData() {}, effectAllowed: "" } }); });
    // The pointer is over the LOWER half of q3's row: the question lands after it.
    row("q3").getBoundingClientRect = () => ({ top: 0, bottom: 20, height: 20, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const over = createEvent.dragOver(row("q3"), { dataTransfer: { dropEffect: "" } });
    Object.defineProperty(over, "clientY", { value: 15 });
    await act(async () => { fireEvent(row("q3"), over); });
    await act(async () => { fireEvent.drop(row("q3"), { dataTransfer: {} }); });
    await settle();
    expect(order()).toEqual([["q2"], ["q3", "q1"]]);
    expect(hist.current!.history.past.length).toBe(steps + 1);
    expect(live()).toMatch(/القسم 2/);
    expect(document.activeElement).toBe(row("q1"));
  });
  it("Alt+↑ on a focused row moves it and keeps focus on it", async () => {
    await openStudio();
    row("q3").focus();
    await key(row("q3"), "ArrowUp", { altKey: true });
    await settle();
    expect(order()).toEqual([["q1", "q2", "q3"], []]);
    expect(document.activeElement).toBe(row("q3"));
  });
});

describe("21F.5 the command palette", () => {
  it("Ctrl+K opens it; typing narrows the commands; Enter runs the first one (here: open a question)", async () => {
    await openStudio();
    await key(card("q1"), "k", { ctrlKey: true });
    const dialog = await screen.findByRole("dialog", { name: "الأوامر" });
    const input = within(dialog).getByRole("combobox");
    await act(async () => { fireEvent.change(input, { target: { value: "OSI" } }); });
    const options = within(dialog).getAllByRole("option");
    expect(options[0].textContent).toContain("عبارة OSI");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    await settle();
    expect(card("q3").classList.contains("is-active")).toBe(true);
  });
  it("adds a question of any type after the open card", async () => {
    await openStudio();
    await activate("q1");
    await key(card("q1"), "k", { ctrlKey: true });
    const dialog = await screen.findByRole("dialog", { name: "الأوامر" });
    await act(async () => { fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "إضافة سؤال: إجابة رقمية" } }); });
    await act(async () => { fireEvent.click(within(dialog).getAllByRole("option")[0]); });
    await settle();
    expect(hist.current!.present!.sections[0].questions[1].presentationType).toBe("numericResponse");
  });
});
