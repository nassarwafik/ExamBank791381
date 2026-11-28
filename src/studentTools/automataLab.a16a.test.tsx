// @vitest-environment happy-dom
// AUTO-A16a (docs/enterprise-automata-lab-a4.md §24) — the drawing edited as the diagram editor's sheet is, with no mode to switch:
//   • pure: a state's four link handles and the press that takes one; the symbols of an arrow; a symbol put on / taken off (a DFA
//     replaces, an NFA adds; the last target removes the cell); a whole arrow removed (finite, push-down, Turing);
//   • the editor: no mode radios; the chosen state shows four handles; «سهم إلى» opens the arrow's window with no drag, and a pressed
//     arrow opens the same window; symbols are toggled there, «حذف السهم» and the Delete key remove the arrow; a push-down automaton's
//     transition is written in the window, and one the machine cannot take is refused THERE (the drawing stays).
// Real mouse drags of a handle are proven in real Chromium: scripts/check-automata-lab-browser.mjs.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { addArrow, arrowSymbols, handlesOf, initialDraft, onHandle, removeArrow, toggleArrowSymbol, BOTTOM, HANDLE_GAP, KIND_LABEL, type LabDraft } from "./automataLab";
import AutomataLabTool from "./AutomataLabTool";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const dfa: LabDraft = { ...initialDraft("DFA"), states: ["q0", "q1", "q2"], accept: ["q2"], cells: { "q0|a": ["q1"], "q0|b": ["q1"], "q1|a": ["q2"] } };

describe("A16a — the arrows on the drawing (pure)", () => {
  it("four link handles outside the circle; a press near one takes it, a press on the circle or far away does not", () => {
    const c = { x: 100, y: 50 }, r = 24, d = r + HANDLE_GAP;
    expect(handlesOf(c, r)).toEqual([{ x: 100, y: 50 - d }, { x: 100 + d, y: 50 }, { x: 100, y: 50 + d }, { x: 100 - d, y: 50 }]);
    expect([onHandle({ x: 100 + d + 3, y: 52 }, c, r), onHandle({ x: 100, y: 50 }, c, r), onHandle({ x: 100 + r - 2, y: 50 }, c, r), onHandle({ x: 300, y: 50 }, c, r)])
      .toEqual([true, false, false, false]);
  });
  it("the symbols of an arrow; putting one on a DFA replaces that state's arrow for it; taking the last one off removes the cell", () => {
    expect([arrowSymbols(dfa, "q0", "q1"), arrowSymbols(dfa, "q0", "q2"), arrowSymbols(dfa, "q1", "q2")]).toEqual([["a", "b"], [], ["a"]]);
    const moved = toggleArrowSymbol(dfa, "q0", "q2", "a");                           // q0 —a→ q2 now, no longer q1
    expect([moved.cells["q0|a"], arrowSymbols(moved, "q0", "q1")]).toEqual([["q2"], ["b"]]);
    const off = toggleArrowSymbol(dfa, "q1", "q2", "a");
    expect("q1|a" in off.cells).toBe(false);
    expect(toggleArrowSymbol(dfa, "q0", "q1", "z")).toBe(dfa);                       // not in the alphabet
  });
  it("an NFA adds a target and takes ε; taking one target off keeps the others", () => {
    const n = toggleArrowSymbol(toggleArrowSymbol({ ...dfa, kind: "NFA" }, "q0", "q2", "a"), "q0", "q0", "ε");
    expect([n.cells["q0|a"], arrowSymbols(n, "q0", "q0")]).toEqual([["q1", "q2"], ["ε"]]);
    expect(toggleArrowSymbol(n, "q0", "q1", "a").cells["q0|a"]).toEqual(["q2"]);
  });
  it("a whole arrow removed: every symbol (finite), every row (push-down, Turing); no such arrow changes nothing", () => {
    const gone = removeArrow(dfa, "q0", "q1");
    expect([gone.cells, removeArrow(dfa, "q2", "q0")]).toEqual([{ "q1|a": ["q2"] }, dfa]);
    const pda = addArrow(addArrow(addArrow({ ...initialDraft("PDA"), states: ["q0", "q1"] }, "q0", "q1"), "q0", "q1"), "q1", "q1");
    expect(removeArrow(pda, "q0", "q1").pda).toEqual([{ from: "q1", read: "a", top: BOTTOM, op: "none", write: "", to: "q1" }]);
    const tm = addArrow(addArrow({ ...initialDraft("TM"), states: ["q0", "q1"] }, "q0", "q1"), "q1", "q0");
    expect([removeArrow(tm, "q1", "q0").tm.length, removeArrow(tm, "q1", "q1")]).toEqual([1, tm]);
  });
});

const fine = () => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === "(pointer: fine)", media: q, addEventListener() {}, removeEventListener() {} })));
const ALL = { id: "automataLab" as const, kinds: ["DFA" as const, "NFA" as const, "PDA" as const, "TM" as const] };
const open = () => { fine(); render(<AutomataLabTool config={ALL} />); fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: عدد a زوجي/ })); return screen.getByTestId("alab-canvas"); };
const tools = () => screen.getByRole("group", { name: "أدوات الرسم" });
const arrowTo = (q: string) => fireEvent.change(within(tools()).getByLabelText("سهم إلى"), { target: { value: q } });
const tableCell = (label: string) => (screen.getByLabelText(label) as HTMLSelectElement).value;

describe("A16a — the editor", () => {
  it("no mode to switch: no radios in the drawing's tools; the chosen state shows four link handles", () => {
    const canvas = open();
    expect(within(tools()).queryAllByRole("radio")).toEqual([]);
    expect(screen.queryByText("رسم الأسهم")).toBeNull();
    expect(canvas.querySelectorAll("circle[data-handle=link]").length).toBe(4);
  });
  it("«سهم إلى»: the arrow's window with no drag — its symbols pressed as the table has them; a symbol put on is the table's arrow", () => {
    open();                                                                         // even a: q0 —a→ q1, q0 —b→ q0, q1 —a→ q0, q1 —b→ q1
    expect(screen.queryByRole("group", { name: /^رمز السهم من/ })).toBeNull();
    arrowTo("q1");
    const win = screen.getByRole("group", { name: "رمز السهم من q0 إلى q1" });
    const sym = (s: string) => within(win).getByRole("button", { name: s });
    expect([sym("a").getAttribute("aria-pressed"), sym("b").getAttribute("aria-pressed")]).toEqual(["true", "false"]);
    expect(document.activeElement).toBe(sym("a"));                                   // the window takes the focus
    fireEvent.click(sym("b"));                                                       // a DFA: (q0, b) leaves q0 for q1
    expect(tableCell("من q0 بالرمز b إلى")).toBe("q1");
    expect(sym("b").getAttribute("aria-pressed")).toBe("true");                      // the window stays for another symbol
    fireEvent.click(sym("a"));                                                       // taken off
    expect(tableCell("من q0 بالرمز a إلى")).toBe("");
    fireEvent.click(within(win).getByRole("button", { name: "تم" }));
    expect(screen.queryByRole("group", { name: /^رمز السهم من/ })).toBeNull();
  });
  it("a pressed arrow opens its window; «حذف السهم» removes every symbol of it; the Delete key does the same", () => {
    const canvas = open();
    const edge = (k: string) => canvas.querySelector("g[data-edge='" + k + "']") as Element;
    // the arrow itself, no state under the pointer. AUTO-A16c — a press released where it was made (a drag bends the arrow instead)
    const press = (k: string) => { fireEvent.pointerDown(edge(k), { button: 0, clientX: -900, clientY: -900 }); fireEvent.pointerUp(edge(k), { button: 0, clientX: -900, clientY: -900 }); };
    press("q1 q0");
    const win = screen.getByRole("group", { name: "رمز السهم من q1 إلى q0" });
    expect(edge("q1 q0").getAttribute("class")).toMatch(/is-used/);                  // the chosen arrow is lit
    fireEvent.click(within(win).getByRole("button", { name: "حذف السهم" }));
    expect(tableCell("من q1 بالرمز a إلى")).toBe("");
    expect(screen.getByText("حُذف السهم من q1 إلى q0.")).toBeTruthy();
    expect(canvas.querySelector("g[data-edge='q1 q0']")).toBeNull();
    press("q0 q1");
    fireEvent.keyDown(canvas, { key: "Delete" });
    expect(tableCell("من q0 بالرمز a إلى")).toBe("");
    expect(screen.queryByRole("group", { name: /^رمز السهم من/ })).toBeNull();
  });
  it("a window with no arrow yet cannot delete; Escape closes it; a press on an empty spot closes it", () => {
    const canvas = open();
    fireEvent.change(within(tools()).getByLabelText("الحالة"), { target: { value: "q1" } });
    arrowTo("q1");                                                                   // q1 —b→ q1 exists
    arrowTo("q0");
    fireEvent.click(within(screen.getByRole("group", { name: "رمز السهم من q1 إلى q0" })).getByRole("button", { name: "a" }));   // off: nothing left
    expect((within(screen.getByRole("group", { name: "رمز السهم من q1 إلى q0" })).getByRole("button", { name: "حذف السهم" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("group", { name: "رمز السهم من q1 إلى q0" }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: /^رمز السهم من/ })).toBeNull();
    arrowTo("q1");
    fireEvent.pointerDown(canvas, { button: 0, clientX: -900, clientY: -900 });
    expect(screen.queryByRole("group", { name: /^رمز السهم من/ })).toBeNull();
  });
  it("a push-down automaton: the transition is written in the arrow's window; one the machine cannot take is refused there, the drawing stays", () => {
    fine();
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("radio", { name: KIND_LABEL.PDA }));
    const rows = () => within(screen.getByRole("region", { name: "انتقالات أوتومات المكدّس" })).getAllByRole("row").length - 1;
    const before = rows();
    arrowTo("q0");
    const win = screen.getByRole("group", { name: "انتقالات السهم من q0 إلى q0" });
    fireEvent.change(within(win).getByLabelText("القمة"), { target: { value: "" } });
    fireEvent.click(within(win).getByRole("button", { name: "أضف الانتقال" }));
    expect(within(win).getByRole("alert").textContent).not.toBe("");                 // refused, with the machine's own message
    expect([rows(), !!screen.queryByTestId("alab-canvas")]).toEqual([before, true]);
    fireEvent.change(within(win).getByLabelText("القمة"), { target: { value: BOTTOM } });
    fireEvent.change(within(win).getByLabelText("العملية"), { target: { value: "push" } });
    fireEvent.change(within(win).getByLabelText("يُكتب"), { target: { value: "A" } });
    fireEvent.click(within(win).getByRole("button", { name: "أضف الانتقال" }));
    expect(rows()).toBe(before + 1);
    expect(within(win).queryByRole("alert")).toBeNull();
    fireEvent.click(within(win).getByRole("button", { name: /^احذف الانتقال ادفع/ }));
    expect(rows()).toBe(before);
  });
});
