// @vitest-environment happy-dom
//
// Phase 21E.2 part 2 — Review Fix 4: the card / section that a structural edit moves or creates is followed (audit A-03, A-06, A-12).
//   A-03  a question's «نقل إلى قسم» select only picks the target: Chromium fires `change` on every ArrowDown of a closed select, and
//         the old select moved the question on the first arrow press (focus fell to <body>, the card landed thousands of px away).
//         The move is the explicit «نقل» button next to it (the bulk bar's pattern); the moved card takes focus in its new section
//         and is revealed.
//   A-06  ↑ / ↓ keep focus on the pressed button and reveal the moved card / section when its heading (or the pressed button) is no
//         longer on screen — React re-inserts the moved node and restores the scroll, which left both off-screen. One in view stays.
//   A-12  a question picked in the type palette (in the section, or inside a scenario) and a section added with «+ إضافة قسم» take
//         focus and are revealed, as an AI insertion already does — focus stayed on the add button, which the new item pushed off-screen.
// Fail-first on the Review Fix 3 head 1fa3d21: every case except the marked pins (the select moved on change; no «نقل» button; no
// reveal after a reorder; focus stayed on «+ إضافة سؤال» / «+ إضافة قسم»). Real-browser evidence: scripts/capture-visual-gate-21e2-builder.mjs
// («RF4 A-03 / A-06 / A-12» checks, at 100 %, 150 %, 200 % and on the phone).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import StructuredQuestionEditor from "./StructuredQuestionEditor";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import { newQuestion } from "./examBuilderState";
import type { StructuredExam } from "./examTypes";
import type { StructuredExamUpdater } from "./examBuilderState";

const Q = (id: string) => ({ examQuestionId: id, presentationType: "shortAnswer", text: "نص " + id, marks: 2, answer: { text: "x" } });
const section = (id: string, title: string, ids: string[]) => ({ id, title, gradingPolicy: "all", stimuli: {}, questions: ids.map(Q) }) as unknown as StructuredExam["sections"][number];
const makeExam = (sections = [section("s1", "القسم الأول", ["q1", "q2", "q3", "q4"]), section("s2", "القسم الثاني", ["r1"])]): StructuredExam => ({
  examId: "ex1", title: "امتحان الوحدة", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z", sections,
} as unknown as StructuredExam);

type Handles = { latest: StructuredExam | null; update: (u: StructuredExamUpdater) => void; setSaving: (v: boolean) => void; past: number };
const h = {} as Handles;
function Host({ initial }: { initial?: StructuredExam }) {
  const hist = useStructuredExamHistory();
  const [saving, setSaving] = useState(false);
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial ?? makeExam(), "saved"); } }, [hist, initial]);
  useEffect(() => { Object.assign(h, { latest: hist.present, update: hist.update, setSaving, past: hist.history?.past.length ?? 0 }); }, [hist]);
  if (!hist.present) return null;
  return (
    <div className="structured-builder-overlay">
      <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => setSaving(true)} saving={saving} onUndo={hist.undo} onRedo={hist.redo}
        canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} />
    </div>
  );
}

/** Every element scrollIntoView was called on (the builder's reveals: alignCard / alignSection), in order. */
let scrolled: Element[] = [];
const original = { matchMedia: window.matchMedia, scroll: HTMLElement.prototype.scrollIntoView };
beforeEach(() => {
  scrolled = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  HTMLElement.prototype.scrollIntoView = function (this: Element) { scrolled.push(this); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.matchMedia = original.matchMedia; HTMLElement.prototype.scrollIntoView = original.scroll; });

const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const start = async (initial?: StructuredExam) => { render(<Host initial={initial} />); await wait(5); };
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const sectionEl = (id: string) => document.querySelector(`[data-section-id="${id}"]`) as HTMLElement;
const order = () => (h.latest!.sections || []).map(s => s.id + ":" + s.questions.map(q => q.examQuestionId).join(","));
const focusOn = (el: HTMLElement) => act(() => { el.focus(); });
/** A keyboard activation (Enter / Space on a focused button = a click with detail 0). */
const press = (el: HTMLElement) => { focusOn(el); fireEvent.click(el); };
const key = (init: KeyboardEventInit) => fireEvent.keyDown(document.activeElement ?? document.body, { bubbles: true, ...init });
const moveSelect = (id: string) => within(card(id)).getByRole("combobox", { name: "نقل إلى قسم" }) as HTMLSelectElement;
const moveButton = (id: string) => within(card(id)).getByRole("button", { name: /^نقل السؤال .+ إلى القسم المختار$/ }) as HTMLButtonElement;
const qReorder = (id: string, dir: "للأعلى" | "للأسفل") => within(card(id).querySelector(".sb-q-head") as HTMLElement).getByRole("button", { name: new RegExp(dir + "$") }) as HTMLButtonElement;
const sReorder = (id: string, dir: "للأعلى" | "للأسفل") => within(sectionEl(id).querySelector(".sb-section-tools") as HTMLElement).getByRole("button", { name: new RegExp(dir + "$") }) as HTMLButtonElement;
/** Places `el` at viewport top `top` (happy-dom has no layout: every rect is 0, i.e. "on screen"). */
const placeAt = (el: Element, top: number, height = 400) => {
  Object.defineProperty(el, "getBoundingClientRect", { configurable: true, value: () => ({ top, bottom: top + height, left: 0, right: 600, width: 600, height, x: 0, y: top, toJSON() {} }) });
};

describe("RF4 A-03 — «نقل إلى قسم» picks the target; «نقل» moves (never an arrow key)", () => {
  it("choosing a section (what an ArrowDown on the closed select does in Chromium) moves nothing and enables «نقل»", async () => {
    await start();
    const select = moveSelect("q2");
    focusOn(select);
    fireEvent.change(select, { target: { value: "s2" } });
    expect(order()).toEqual(["s1:q1,q2,q3,q4", "s2:r1"]);
    expect(h.past).toBe(0);                                                        // no history step either
    expect(document.activeElement).toBe(moveSelect("q2"));
    expect(moveSelect("q2").value).toBe("s2");
    expect(moveButton("q2").disabled).toBe(false);
  });
  it("«نقل» moves the question as ONE step; the moved card takes focus in its new section and is revealed", async () => {
    await start();
    fireEvent.change(moveSelect("q2"), { target: { value: "s2" } });
    scrolled = [];
    press(moveButton("q2"));
    expect(order()).toEqual(["s1:q1,q3,q4", "s2:r1,q2"]);
    expect(h.past).toBe(1);
    expect(card("q2").closest("[data-section-id]")).toBe(sectionEl("s2"));
    expect(document.activeElement).toBe(card("q2"));
    expect(scrolled).toContain(card("q2"));
    expect(moveSelect("q2").value).toBe("s2");                                     // the card's select now shows where it is
    expect(moveButton("q2").disabled).toBe(true);
  });
  it("«نقل» is disabled until another section is chosen, again when the choice goes back to the current one, and while saving", async () => {
    await start();
    expect(moveButton("q2").disabled).toBe(true);
    fireEvent.change(moveSelect("q2"), { target: { value: "s2" } });
    expect(moveButton("q2").disabled).toBe(false);
    fireEvent.change(moveSelect("q2"), { target: { value: "s1" } });
    expect(moveButton("q2").disabled).toBe(true);
    fireEvent.click(moveButton("q2"));
    expect(order()).toEqual(["s1:q1,q2,q3,q4", "s2:r1"]);
    fireEvent.change(moveSelect("q2"), { target: { value: "s2" } });
    act(() => h.setSaving(true));
    expect(moveButton("q2").disabled).toBe(true);
    fireEvent.click(moveButton("q2"));
    expect(order()).toEqual(["s1:q1,q2,q3,q4", "s2:r1"]);
  });
  it("a picked section deleted before «نقل»: the choice falls back to the current section, «نقل» is disabled and the question stays", async () => {
    await start(makeExam([section("s1", "أ", ["q1", "q2"]), section("s2", "ب", ["r1"]), section("s3", "ج", ["t1"])]));
    fireEvent.change(moveSelect("q1"), { target: { value: "s3" } });
    expect(moveButton("q1").disabled).toBe(false);
    press(within(sectionEl("s3")).getByRole("button", { name: "حذف القسم" }));
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s1", "s2"]);
    expect(moveSelect("q1").value).toBe("s1");
    expect(moveButton("q1").disabled).toBe(true);
    fireEvent.click(moveButton("q1"));
    expect(order()).toEqual(["s1:q1,q2", "s2:r1"]);
  });
  it("Ctrl+Z after the move puts the question back and keeps focus on its card", async () => {
    await start();
    fireEvent.change(moveSelect("q2"), { target: { value: "s2" } });
    press(moveButton("q2"));
    key({ key: "z", ctrlKey: true });
    expect(order()).toEqual(["s1:q1,q2,q3,q4", "s2:r1"]);
    expect(document.activeElement).toBe(card("q2"));
  });
  it("the card alone: a change on the select never calls onMoveToSection; «نقل» calls it once with the chosen section", () => {
    const onMoveToSection = vi.fn();
    render(<StructuredQuestionEditor question={newQuestion("multipleChoice")} index={1} total={3} sectionOptions={[{ id: "s1", title: "أ" }, { id: "s2", title: "ب" }, { id: "s3", title: "ج" }]}
      currentSectionId="s1" groupOptions={[]} onChange={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} onDuplicate={vi.fn()} onMoveToSection={onMoveToSection} onPreview={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "نقل إلى قسم" }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "s2" } });
    fireEvent.change(select, { target: { value: "s3" } });
    expect(onMoveToSection).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "نقل السؤال 2 إلى القسم المختار" });
    expect(button.textContent).toBe("نقل");                                        // the visible label is part of the name (WCAG 2.5.3)
    fireEvent.click(button);
    expect(onMoveToSection).toHaveBeenCalledTimes(1);
    expect(onMoveToSection).toHaveBeenCalledWith("s3");
  });
  it("the card alone: a pending image disables the select and «نقل»; a click moves nothing", () => {
    const onMoveToSection = vi.fn();
    render(<StructuredQuestionEditor question={newQuestion("multipleChoice")} index={0} total={2} sectionOptions={[{ id: "s1", title: "أ" }, { id: "s2", title: "ب" }]}
      currentSectionId="s1" groupOptions={[]} onChange={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} onDuplicate={vi.fn()} onMoveToSection={onMoveToSection} onPreview={vi.fn()} mediaPending />);
    const select = screen.getByRole("combobox", { name: "نقل إلى قسم" }) as HTMLSelectElement;
    const button = screen.getByRole("button", { name: "نقل السؤال 1 إلى القسم المختار" }) as HTMLButtonElement;
    expect(select.disabled).toBe(true);
    expect(button.disabled).toBe(true);
    fireEvent.change(select, { target: { value: "s2" } });
    fireEvent.click(button);
    expect(onMoveToSection).not.toHaveBeenCalled();
  });
});

describe("RF4 A-06 — ↑ / ↓ reveal the moved card / section; focus stays on the pressed button", () => {
  it("↓ whose card lands below the screen: focus stays on the pressed ↓ and the card is revealed", async () => {
    await start();
    const down = qReorder("q1", "للأسفل");
    placeAt(card("q1"), 1767);
    scrolled = [];
    press(down);
    expect(order()[0]).toBe("s1:q2,q1,q3,q4");
    expect(document.activeElement).toBe(down);
    expect(scrolled).toEqual([card("q1")]);
  });
  it("↑ whose card lands above the screen (under the toolbar) is revealed too", async () => {
    await start();
    const up = qReorder("q3", "للأعلى");
    placeAt(card("q3"), -900);
    scrolled = [];
    press(up);
    expect(order()[0]).toBe("s1:q1,q3,q2,q4");
    expect(document.activeElement).toBe(up);
    expect(scrolled).toEqual([card("q3")]);
  });
  it("the card's heading is in view but the pressed button is below the screen → revealed", async () => {
    await start();
    const down = qReorder("q2", "للأسفل");
    placeAt(card("q2"), 10);
    placeAt(down, window.innerHeight + 40, 36);
    scrolled = [];
    press(down);
    expect(document.activeElement).toBe(down);
    expect(scrolled).toEqual([card("q2")]);
  });
  it("pin: a moved card still in view (heading and pressed button) does not scroll the page", async () => {
    await start();
    const down = qReorder("q2", "للأسفل");
    placeAt(card("q2"), 200);
    placeAt(down, 210, 36);
    scrolled = [];
    press(down);
    expect(order()[0]).toBe("s1:q1,q3,q2,q4");
    expect(document.activeElement).toBe(down);
    expect(scrolled).toEqual([]);
  });
  it("a section moved below the screen: focus stays on its pressed ↓ and the section is revealed", async () => {
    await start(makeExam([section("s1", "أ", ["q1"]), section("s2", "ب", ["q2"]), section("s3", "ج", ["q3"])]));
    const down = sReorder("s1", "للأسفل");
    placeAt(sectionEl("s1"), 2400);
    scrolled = [];
    press(down);
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s2", "s1", "s3"]);
    expect(document.activeElement).toBe(down);
    expect(scrolled).toEqual([sectionEl("s1")]);
  });
  it("pin: only the moved item is followed — a later, unrelated edit scrolls nothing", async () => {
    await start();
    placeAt(card("q1"), 1767);
    press(qReorder("q1", "للأسفل"));
    scrolled = [];
    fireEvent.change(within(card("q3")).getByRole("spinbutton", { name: "العلامة" }), { target: { value: "5" } });
    expect(h.latest!.sections[0].questions[2].marks).toBe(5);
    expect(scrolled).toEqual([]);
  });
});

describe("RF4 A-12 — an added question / section takes focus and is revealed", () => {
  it("«+ إضافة قسم» → the new section has focus and is revealed (focus no longer stays on the button)", async () => {
    await start();
    scrolled = [];
    press(screen.getByRole("button", { name: "+ إضافة قسم" }));
    const added = h.latest!.sections[2];
    expect(added.title).toBe("القسم 3");
    expect(document.activeElement).toBe(sectionEl(added.id));
    expect(scrolled).toContain(sectionEl(added.id));
    expect(h.past).toBe(1);
  });
  it("a type picked in the palette → the new card has focus and is revealed (not «+ إضافة سؤال», where the palette returned focus)", async () => {
    await start();
    press(within(sectionEl("s1")).getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await wait(30);
    scrolled = [];
    press(within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "multipleChoice")!);
    await wait(10);
    const ids = h.latest!.sections[0].questions.map(q => q.examQuestionId);
    expect(ids).toHaveLength(5);
    const added = ids[4];
    expect(screen.queryByRole("dialog", { name: "إضافة سؤال" })).toBeNull();
    expect(document.activeElement).toBe(card(added));
    expect(scrolled).toContain(card(added));
  });
  it("a type picked from a scenario's «+ سؤال جديد داخل السيناريو» → the new (linked) card has focus", async () => {
    await start(makeExam([section("s1", "أ", ["q1", "q2"])]));
    press(within(sectionEl("s1")).getByRole("button", { name: "+ إضافة سيناريو" }));
    const scenario = await screen.findByTestId("scenario-editor", {}, { timeout: 3000 });
    press(within(scenario).getByRole("button", { name: "+ سؤال جديد داخل السيناريو" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await wait(30);
    press(within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "shortAnswer")!);
    await wait(10);
    const s = h.latest!.sections[0] as unknown as { questions: { examQuestionId: string }[]; scenarios: { questionIds: string[] }[] };
    const added = s.scenarios[0].questionIds[0];
    expect(s.questions.map(q => q.examQuestionId)).toContain(added);
    expect(document.activeElement).toBe(card(added));
  });
  it("pin: a palette closed without a pick keeps focus on «+ إضافة سؤال» and adds nothing", async () => {
    await start();
    const add = within(sectionEl("s1")).getByRole("button", { name: "+ إضافة سؤال" });
    press(add);
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await wait(30);
    fireEvent.keyDown(d, { key: "Escape" });
    await wait(10);
    expect(screen.queryByRole("dialog", { name: "إضافة سؤال" })).toBeNull();
    expect(h.latest!.sections[0].questions).toHaveLength(4);
    expect(document.activeElement).toBe(add);
  });
});
