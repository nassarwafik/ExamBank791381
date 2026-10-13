// @vitest-environment happy-dom
//
// Phase 21E.2 part 2 — Review Fix 4: focus continuity in the structured builder (audit A-07, A-08, A-09 / B-04, A-11, A-13). Inside
// App's aria-modal overlay an action must never leave keyboard focus on <body>: the next Tab restarts at «رجوع», and useModalSurface
// reads the next Escape on <body> as the builder's own Escape. In Chromium a focused control that becomes disabled is blurred to
// <body> at once, and a focused control that leaves the page takes focus with it. happy-dom keeps focus on a control that becomes
// disabled, so the builder treats focus on a disabled control as lost too — the cases below assert WHERE focus goes:
//   A-07  ↓ / ↑ moving a question or a section to the last / first place disables the pressed button: focus goes to the same card's
//         or section's other reorder button (a middle move keeps focus on the pressed one, as before);
//   A-08  the toolbar «تراجع» / «إعادة» used for the last available step disables itself: focus goes to the other history button —
//         and when that step brought a deleted question back while its toast was up, the restored question takes focus;
//   A-09 / B-04  «حفظ مسودة» / «اعتماد نهائي» stay focusable while a save runs (aria-disabled + a guard: a second activation saves
//         nothing), so focus stays on the button that started the save; a pending media operation still disables them natively;
//   A-11  the bulk bar's «إلغاء التحديد» → the last toggled card's checkbox; the explorer's «إلغاء التحديد» → «تحديد الظاهر»; a
//         confirmed bulk delete → the first surviving neighbour of the removed block (next, else previous), as a single deletion does;
//   A-13  a Ctrl+Z / Ctrl+Y that removes the focused card (a duplicate) → its nearest surviving neighbour; the redo that brings it
//         back takes focus back to it; a card re-created elsewhere (moved to another section) takes focus itself.
// Fail-first on the Review Fix 3 head 1fa3d21: every case below except the marked pins (focus stayed on the disabled control, or
// fell to <body>; the save buttons were natively disabled). Real-browser evidence: scripts/capture-visual-gate-21e2-builder.mjs
// («RF4 …» checks, at 100 %, 150 %, 200 % and on the phone).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder, { type SaveMode } from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam } from "./examTypes";
import type { StructuredExamUpdater } from "./examBuilderState";
import { toolbarItem } from "./builder/toolbarTestActions";

const Q = (id: string) => ({ examQuestionId: id, presentationType: "shortAnswer", text: "نص " + id, marks: 2, answer: { text: "x" } });
const section = (id: string, title: string, ids: string[]) => ({ id, title, gradingPolicy: "all", stimuli: {}, questions: ids.map(Q) }) as unknown as StructuredExam["sections"][number];
const makeExam = (sections = [section("s1", "القسم الأول", ["q1", "q2", "q3"]), section("s2", "القسم الثاني", ["r1"])]): StructuredExam => ({
  examId: "ex1", title: "امتحان الوحدة", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z", sections,
} as unknown as StructuredExam);

type Handles = { latest: StructuredExam | null; update: (u: StructuredExamUpdater) => void; setSaving: (v: boolean) => void; saves: SaveMode[] };
const h = { saves: [] } as unknown as Handles;
function Host({ initial }: { initial?: StructuredExam }) {
  const hist = useStructuredExamHistory();
  const [saving, setSaving] = useState(false);
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial ?? makeExam(), "saved"); } }, [hist, initial]);
  useEffect(() => { Object.assign(h, { latest: hist.present, update: hist.update, setSaving }); }, [hist]);
  if (!hist.present) return null;
  // Like App: a save sets `saving` at once and clears it when the request settles (the test settles it).
  const onSave = (mode: SaveMode) => { h.saves.push(mode); setSaving(true); };
  return (
    <div className="structured-builder-overlay">
      <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={onSave} saving={saving} onUndo={hist.undo} onRedo={hist.redo}
        canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} />
    </div>
  );
}

const original = { matchMedia: window.matchMedia, scroll: HTMLElement.prototype.scrollIntoView };
beforeEach(() => {
  h.saves = [];
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  HTMLElement.prototype.scrollIntoView = function () {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.matchMedia = original.matchMedia; HTMLElement.prototype.scrollIntoView = original.scroll; });

const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const start = async (initial?: StructuredExam) => { render(<Host initial={initial} />); await wait(5); };
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const sectionEl = (id: string) => document.querySelector(`[data-section-id="${id}"]`) as HTMLElement;
const order = () => (h.latest!.sections || []).map(s => s.id + ":" + s.questions.map(q => q.examQuestionId).join(","));
const toolbar = () => document.querySelector(".sb-toolbar") as HTMLElement;
const tbButton = (name: string) => within(toolbar()).getByRole("button", { name }) as HTMLButtonElement;
const focusOn = (el: HTMLElement) => act(() => { el.focus(); });
/** A keyboard activation (Enter / Space on a focused button = a click with detail 0). */
const press = (el: HTMLElement) => { focusOn(el); fireEvent.click(el); };
const key = (init: KeyboardEventInit) => fireEvent.keyDown(document.activeElement ?? document.body, { bubbles: true, ...init });
const reorder = (host: HTMLElement, dir: "للأعلى" | "للأسفل") => within(host).getAllByRole("button").find(b => (b.getAttribute("aria-label") || "").endsWith(dir) && b.closest(".sb-question, [data-section-id]") === host) as HTMLButtonElement;
const qReorder = (id: string, dir: "للأعلى" | "للأسفل") => reorder(card(id), dir);
const sReorder = (id: string, dir: "للأعلى" | "للأسفل") => within(sectionEl(id).querySelector(".sb-section-tools") as HTMLElement).getByRole("button", { name: new RegExp(dir + "$") }) as HTMLButtonElement;
const bulkBar = () => document.querySelector(".sb-bulk-bar") as HTMLElement | null;
const checkbox = (id: string) => within(card(id)).getByRole("checkbox", { name: "تحديد السؤال" }) as HTMLInputElement;

describe("RF4 A-07 — a question / section moved to the first or last place keeps keyboard focus on its card / section", () => {
  it("↓ to the last place: the pressed ↓ is disabled; focus is on the SAME card's ↑ (enabled)", async () => {
    await start();
    press(qReorder("q2", "للأسفل"));
    expect(order()[0]).toBe("s1:q1,q3,q2");
    expect(qReorder("q2", "للأسفل").disabled).toBe(true);
    expect(document.activeElement).toBe(qReorder("q2", "للأعلى"));
    expect(qReorder("q2", "للأعلى").disabled).toBe(false);
  });
  it("↑ to the first place: focus is on the same card's ↓", async () => {
    await start();
    press(qReorder("q2", "للأعلى"));
    expect(order()[0]).toBe("s1:q2,q1,q3");
    expect(document.activeElement).toBe(qReorder("q2", "للأسفل"));
  });
  it("pin: a middle move keeps focus on the pressed button (it stays enabled)", async () => {
    await start(makeExam([section("s1", "أ", ["q1", "q2", "q3", "q4"])]));
    const down = qReorder("q2", "للأسفل");
    press(down);
    expect(order()[0]).toBe("s1:q1,q3,q2,q4");
    expect(document.activeElement).toBe(down);
  });
  it("a section moved to the last / first place: focus is on that section's other reorder button", async () => {
    await start();
    press(sReorder("s1", "للأسفل"));
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s2", "s1"]);
    expect(sReorder("s1", "للأسفل").disabled).toBe(true);
    expect(document.activeElement).toBe(sReorder("s1", "للأعلى"));
    press(sReorder("s1", "للأعلى"));
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s1", "s2"]);
    expect(document.activeElement).toBe(sReorder("s1", "للأسفل"));
  });
});

describe("RF4 A-08 — the last available toolbar undo / redo step never strands focus", () => {
  it("«تراجع» on the last undo step → focus on «إعادة»; «إعادة» on the last redo step → focus on «تراجع»", async () => {
    await start();
    act(() => h.update(e => ({ ...e, title: "عنوان جديد" })));
    press(tbButton("تراجع"));
    expect(h.latest!.title).toBe("امتحان الوحدة");
    expect(tbButton("تراجع").disabled).toBe(true);
    expect(document.activeElement).toBe(tbButton("إعادة"));
    press(tbButton("إعادة"));
    expect(h.latest!.title).toBe("عنوان جديد");
    expect(tbButton("إعادة").disabled).toBe(true);
    expect(document.activeElement).toBe(tbButton("تراجع"));
  });
  it("pin: an undo that leaves «تراجع» enabled keeps focus on it", async () => {
    await start();
    act(() => h.update(e => ({ ...e, title: "أ" })));
    act(() => h.update(e => ({ ...e, title: "ب" })));
    press(tbButton("تراجع"));
    expect(h.latest!.title).toBe("أ");
    expect(document.activeElement).toBe(tbButton("تراجع"));
  });
  it("a deletion undone from the toolbar while its toast is up: the restored question takes focus (like the toast's «تراجع»)", async () => {
    await start();
    press(within(card("q2")).getByRole("button", { name: "حذف" }));
    expect(document.activeElement).toBe(card("q3"));
    expect(screen.queryByRole("button", { name: "تراجع عن حذف السؤال" })).not.toBeNull();
    press(tbButton("تراجع"));
    expect(order()[0]).toBe("s1:q1,q2,q3");
    expect(screen.queryByRole("button", { name: "تراجع عن حذف السؤال" })).toBeNull();   // the toast left with the undo
    expect(document.activeElement).toBe(card("q2"));
  });
});

describe("RF4 A-09 / B-04 — the save buttons stay focusable while a save runs", () => {
  for (const [name, mode] of [["حفظ مسودة", "draft"], ["اعتماد نهائي", "final"]] as const) {
    it("«" + name + "»: aria-disabled (not disabled) during the save, focus stays on it, a second activation saves nothing; after the save it is available again with focus still on it", async () => {
      await start();
      const button = () => within(toolbar().querySelector(".sb-tb-save") as HTMLElement).getAllByRole("button").find(b => (b.textContent || "").includes(mode === "draft" ? "" : name) && (mode === "final" ? b.classList.contains("is-primary") : !b.classList.contains("is-primary"))) as HTMLButtonElement;
      const b = button();
      press(b);
      expect(h.saves).toEqual([mode]);
      expect(button()).toBe(b);
      expect(b.disabled).toBe(false);
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(document.activeElement).toBe(b);
      if (mode === "draft") expect((b.textContent || "").trim()).toBe("جارٍ الحفظ…");
      fireEvent.click(b);                                                  // Enter again while saving
      fireEvent.click(b, { detail: 1 });                                   // or a click
      expect(h.saves).toEqual([mode]);
      act(() => h.setSaving(false));
      expect(b.getAttribute("aria-disabled")).toBeNull();
      expect(document.activeElement).toBe(b);
      fireEvent.click(b);
      expect(h.saves).toEqual([mode, mode]);
    });
  }
});

describe("RF4 A-11 — clearing the selection or a bulk delete never strands focus", () => {
  it("the bulk bar's «إلغاء التحديد» → the last toggled card's checkbox", async () => {
    await start();
    fireEvent.click(checkbox("q1"));
    fireEvent.click(checkbox("q3"));
    press(within(bulkBar()!).getByRole("button", { name: "إلغاء التحديد" }));
    expect(bulkBar()).toBeNull();
    expect(checkbox("q3").checked).toBe(false);
    expect(document.activeElement).toBe(checkbox("q3"));
  });
  it("the explorer's «إلغاء التحديد» → its «تحديد الظاهر»", async () => {
    await start();
    fireEvent.click(toolbarItem("مستكشف الأسئلة"));
    const nav = document.querySelector("aside.sb-navigator") as HTMLElement;
    fireEvent.click(within(nav).getByRole("button", { name: "تحديد الظاهر" }));
    expect(bulkBar()).not.toBeNull();
    press(within(nav).getByRole("button", { name: "إلغاء التحديد" }));
    expect(bulkBar()).toBeNull();
    expect(document.activeElement).toBe(within(nav).getByRole("button", { name: "تحديد الظاهر" }));
  });
  it("…the same in the explorer's dialog (≤ 900 px)", async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("max-width: 900px"), media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    await start();
    fireEvent.click(toolbarItem("مستكشف الأسئلة"));
    const dialog = await screen.findByRole("dialog", { name: "مستكشف الأسئلة" });
    fireEvent.click(within(dialog).getByRole("button", { name: "تحديد الظاهر" }));
    press(within(dialog).getByRole("button", { name: "إلغاء التحديد" }));
    expect(bulkBar()).toBeNull();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "تحديد الظاهر" }));
  });
  it("a confirmed bulk delete → the next surviving question after the removed block, else the previous one", async () => {
    await start(makeExam([section("s1", "أ", ["q1", "q2", "q3", "q4"]), section("s2", "ب", ["r1"])]));
    fireEvent.click(checkbox("q2"));
    fireEvent.click(checkbox("q3"));
    press(within(bulkBar()!).getByRole("button", { name: "حذف" }));
    const dialog = await screen.findByRole("dialog", { name: "حذف الأسئلة المحددة" });
    press(within(dialog).getByRole("button", { name: "حذف" }));
    await wait(5);
    expect(order()[0]).toBe("s1:q1,q4");
    expect(document.activeElement).toBe(card("q4"));
    fireEvent.click(checkbox("q4"));
    press(within(bulkBar()!).getByRole("button", { name: "حذف" }));
    press(within(await screen.findByRole("dialog", { name: "حذف الأسئلة المحددة" })).getByRole("button", { name: "حذف" }));
    await wait(5);
    expect(order()[0]).toBe("s1:q1");
    expect(document.activeElement).toBe(card("q1"));
  });
});

describe("RF4 A-13 — a history step that removes the focused card never strands focus", () => {
  const dupOf = (id: string) => { const ids = h.latest!.sections[0].questions.map(q => q.examQuestionId); return ids[ids.indexOf(id) + 1]; };
  it("Ctrl+Z removes the focused duplicate → its next surviving neighbour; Ctrl+Y brings it back → focus follows it", async () => {
    await start();
    press(within(card("q2")).getByRole("button", { name: "تكرار" }));
    const copy = dupOf("q2");
    expect(copy).toMatch(/^q-/);
    focusOn(within(card(copy)).getByRole("button", { name: "تكرار" }));
    key({ key: "z", ctrlKey: true });
    expect(card(copy)).toBeNull();
    expect(document.activeElement).toBe(card("q3"));
    key({ key: "y", ctrlKey: true });
    expect(card(copy)).not.toBeNull();
    expect(document.activeElement).toBe(card(copy));
  });
  it("the removed card was the last of its section → the previous one", async () => {
    await start();
    press(within(card("q3")).getByRole("button", { name: "تكرار" }));
    const copy = dupOf("q3");
    focusOn(checkbox(copy));
    key({ key: "z", ctrlKey: true });
    expect(card(copy)).toBeNull();
    expect(document.activeElement).toBe(card("q3"));
  });
  it("a card re-created in another section (moved with «نقل إلى قسم») takes focus itself", async () => {
    await start();
    // RF4 (A-03, owner-directed) — the select picks the target; the explicit «نقل» moves the question (a choice alone moves nothing).
    const move = within(card("q2")).getByRole("combobox", { name: "نقل إلى قسم" }) as HTMLSelectElement;
    focusOn(move);
    fireEvent.change(move, { target: { value: "s2" } });
    expect(order()).toEqual(["s1:q1,q2,q3", "s2:r1"]);
    press(within(card("q2")).getByRole("button", { name: /^نقل السؤال .+ إلى القسم المختار$/ }));
    expect(order()).toEqual(["s1:q1,q3", "s2:r1,q2"]);
    expect(document.activeElement).toBe(card("q2"));
  });
  it("Ctrl+Z removing the focused (just added) section → its surviving neighbour section; Ctrl+Y → the section again", async () => {
    await start();
    press(screen.getByRole("button", { name: "+ إضافة قسم" }));
    const added = h.latest!.sections[2].id;
    focusOn(within(sectionEl(added)).getByRole("button", { name: "حذف القسم" }));
    key({ key: "z", ctrlKey: true });
    expect(sectionEl(added)).toBeNull();
    expect(document.activeElement).toBe(sectionEl("s2"));
    key({ key: "y", ctrlKey: true });
    expect(document.activeElement).toBe(sectionEl(added));
  });
});

describe("RF4 — the continuity step's limits", () => {
  it("any other control that ends disabled (a save starts while focus is in a card's field) → its card, never <body>", async () => {
    await start();
    const marks = within(card("q2")).getByRole("spinbutton", { name: "العلامة" });
    focusOn(marks);
    act(() => h.setSaving(true));
    expect((marks as HTMLInputElement).disabled).toBe(true);
    expect(document.activeElement).toBe(card("q2"));
  });
  it("a toast's own controls are its own: after the toast's «تراجع» focus goes straight to the restored card, never through the toolbar", async () => {
    await start();
    press(within(card("q2")).getByRole("button", { name: "حذف" }));
    const focused: Element[] = [];
    const original = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, o?: FocusOptions) { focused.push(this); return original.call(this, o); });
    press(screen.getByRole("button", { name: "تراجع عن حذف السؤال" }));
    await wait(10);
    expect(document.activeElement).toBe(card("q2"));
    expect(focused).not.toContain(toolbar());
  });
  it("pin: focus the teacher put elsewhere is never taken (a plain blur, then an unrelated change)", async () => {
    await start();
    focusOn(qReorder("q2", "للأسفل"));
    act(() => { (document.activeElement as HTMLElement).blur(); });
    act(() => h.update(e => ({ ...e, title: "عنوان آخر" })));
    expect(document.activeElement).toBe(document.body);
  });
});
