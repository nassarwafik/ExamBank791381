// @vitest-environment happy-dom
// AUTO-A6b (docs/enterprise-automata-lab-a4.md §9) — «ارسم بالفأرة»:
//   • the pure layout: the course's automatic layout, the learner's cells first, never two states on one cell; a point → its grid cell
//     (snapped, inside the grid) and the state under it; moving (onto another state: they swap); a state added at a free cell; an
//     arrow drawn (a DFA replaces that state's arrow for the symbol, an NFA adds, ε only in an NFA; a PDA / TM gets a row);
//   • the editor: on a desktop only (a fine pointer; a phone keeps the table); the non-dragging way — the state list, the move buttons
//     and the keyboard's arrows, «بداية» / «قبول» / «حذف» — and the layout is kept: the player draws the state where it was put.
// Real mouse drags (move, swap, arrow, double-click) are proven in real Chromium: scripts/check-automata-lab-browser.mjs.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { gridLayout } from "../learning/activities/automaton";
import { addArrow, addStateAt, cellAt, checkDraft, initialDraft, labLayout, moveStateTo, removeState, stateAt, BOTTOM, type LabDraft } from "./automataLab";
import AutomataLabTool from "./AutomataLabTool";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const three: LabDraft = { ...initialDraft("DFA"), states: ["q0", "q1", "q2"], accept: ["q2"], cells: { "q0|a": ["q1"], "q1|a": ["q2"] } };
const machine = (d: LabDraft) => { const c = checkDraft(d); if (!c.machine) throw new Error("not built"); return c.machine; };

describe("A6b — the layout and the edits (pure)", () => {
  it("no choice: the course's automatic layout; the learner's cells first; never two states on one cell", () => {
    const m = machine(three);
    expect(labLayout(m)).toEqual(gridLayout(m));                                     // q0 [0,0], q1 [1,0], q2 [2,0]
    const l = labLayout(m, { q2: [0, 0] });                                          // q2 put on q0's automatic cell
    expect(l).toEqual({ q2: [0, 0], q0: [0, 1], q1: [1, 0] });                      // q0 goes down its column
    const twice = labLayout(m, { q1: [3, 3], q2: [3, 3] });                          // two choices of one cell: the second is placed
    expect(new Set(Object.values(twice).map(c => c.join())).size).toBe(3);
  });
  it("a point snaps to its grid cell (inside the grid); the state under a point", () => {
    expect(cellAt({ x: 160, y: 50 }, { w: 150, h: 120 })).toEqual([1, 0]);
    expect(cellAt({ x: -400, y: 9000 }, { w: 150, h: 120 })).toEqual([0, 20]);
    const pos = { q0: { x: 0, y: 0 }, q1: { x: 150, y: 0 } };
    expect([stateAt({ x: 10, y: -10 }, pos, 24), stateAt({ x: 75, y: 0 }, pos, 24), stateAt({ x: 160, y: 5 }, pos, 24)]).toEqual(["q0", null, "q1"]);
  });
  it("moving: to a free cell; onto another state they swap; the same cell changes nothing; removing a state drops its cell", () => {
    const now = labLayout(machine(three));
    expect(moveStateTo(three, now, "q2", [2, 3]).layout).toEqual({ q0: [0, 0], q1: [1, 0], q2: [2, 3] });
    expect(moveStateTo(three, now, "q0", [1, 0]).layout).toEqual({ q0: [1, 0], q1: [0, 0], q2: [2, 0] });
    expect(moveStateTo(three, now, "q0", [0, 0])).toBe(three);
    expect(removeState({ ...three, layout: now }, "q1").layout).toEqual({ q0: [0, 0], q2: [2, 0] });
  });
  it("a state added at a free cell (named as the table names it); a taken cell or the limit: nothing", () => {
    const now = labLayout(machine(three));
    const d = addStateAt(three, now, [1, 2]);
    expect([d.states, d.layout?.q3]).toEqual([["q0", "q1", "q2", "q3"], [1, 2]]);
    expect(addStateAt(three, now, [1, 0])).toBe(three);
    const full = { ...three, states: Array.from({ length: 24 }, (_, i) => "q" + i) };
    expect(addStateAt(full, labLayout(machine(full)), [9, 9])).toBe(full);
  });
  it("an arrow: a DFA replaces that state's arrow for the symbol; an NFA adds (and takes ε); a PDA / TM gets a row from → to", () => {
    expect(addArrow(three, "q0", "q2", "a").cells["q0|a"]).toEqual(["q2"]);
    expect(addArrow(three, "q0", "q0", "ε")).toBe(three);                            // no ε in a DFA
    expect(addArrow(three, "q0", "q0", "z")).toBe(three);                            // not in the alphabet
    const n = addArrow(addArrow({ ...three, kind: "NFA" }, "q0", "q2", "a"), "q1", "q1", "ε");
    expect([n.cells["q0|a"], n.cells["q1|ε"]]).toEqual([["q1", "q2"], ["q1"]]);
    expect(addArrow({ ...initialDraft("PDA"), states: ["q0", "q1"] }, "q0", "q1").pda).toEqual([{ from: "q0", read: "a", top: BOTTOM, op: "none", write: "", to: "q1" }]);
    expect(addArrow({ ...initialDraft("TM"), states: ["q0", "q1"] }, "q1", "q1").tm).toEqual([{ from: "q1", read: "a", write: "a", move: "R", to: "q1" }]);
  });
});

const fine = (on: boolean) => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: on && q === "(pointer: fine)", media: q, addEventListener() {}, removeEventListener() {} })));
const ALL = { id: "automataLab" as const, kinds: ["DFA" as const, "NFA" as const, "PDA" as const, "TM" as const] };
const circles = (el: HTMLElement) => [...el.querySelectorAll("g.learning-automaton-state")].map(g => [g.querySelector("text")?.textContent, Number(g.querySelector("circle")?.getAttribute("cx"))]);

describe("A6b — the editor", () => {
  it("a phone (no fine pointer): no drawing editor, the table only", () => {
    fine(false);
    render(<AutomataLabTool config={ALL} />);
    expect(screen.queryByTestId("alab-canvas")).toBeNull();
  });
  it("a desktop: the editor above the table; the move buttons and the keyboard move the chosen state, and the player draws it there", () => {
    fine(true);
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: عدد a زوجي/ }));
    const canvas = screen.getByTestId("alab-canvas");
    const player = screen.getByRole("heading", { name: /الرسم والتشغيل/ }).closest("section") as HTMLElement;
    const before = circles(player);
    fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "q1" } });
    fireEvent.click(within(screen.getByRole("group", { name: "انقل q1 خانة" })).getByRole("button", { name: "أسفل" }));
    expect(screen.getByText("نُقلت q1.")).toBeTruthy();
    fireEvent.keyDown(canvas, { key: "ArrowLeft" });                                 // q1 onto q0's column, below it
    const after = circles(player);
    expect(after.find(c => c[0] === "q1")![1]).toBe(before.find(c => c[0] === "q0")![1]);   // same x as q0 now: the player follows
    fireEvent.keyDown(canvas, { key: "ArrowUp" });                                   // onto q0: they swap
    expect(screen.getByText("تبادلت q1 وq0 مكانيهما.")).toBeTruthy();
  });
  it("«بداية», «قبول» and «حذف» on the chosen state, as in the states list", () => {
    fine(true);
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: عدد a زوجي/ }));
    const tools = screen.getByRole("group", { name: "أدوات الرسم" });
    fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "q1" } });
    fireEvent.click(within(tools).getByRole("button", { name: "قبول" }));
    expect((screen.getAllByRole("checkbox", { name: "قبول" })[1] as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(tools).getByRole("button", { name: "بداية" }));
    expect((screen.getAllByRole("radio", { name: "بداية" })[1] as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(tools).getByRole("button", { name: "حذف" }));
    expect(screen.getByText("حُذفت الحالة q1 وأسهمها.")).toBeTruthy();
    expect(within(screen.getByRole("heading", { name: /الحالات/ }).closest("section") as HTMLElement).queryByText("q1")).toBeNull();
  });
});
