// @vitest-environment happy-dom
// AUTO-A16b (docs/enterprise-automata-lab-a4.md §25) — a state moved FREELY on the drawing:
//   • pure: a point → its place (a fraction of the grid's cells, two decimals, inside the grid); the state a place would crowd; snapping
//     to a nearby state's column / row, else a whole cell's; a state placed (no swap) and two states swapped; the automatic layout
//     keeps clear of a state placed between the cells;
//   • the scene draws a state exactly where its fractional place says;
//   • the editor: a whole-cell step is as before (and swaps); Shift + an arrow key is a fine step, stopped by a neighbour;
//   • the contract: a place between the cells is what the exam answer stores, and reads back (automatonDesign@1, presentation only).
// Real free drags (no jump, the frame held still, no landing on another state) are proven in real Chromium: scripts/check-automata-lab-browser.mjs.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { buildScene } from "../learning/activities/automatonScene";
import { readAutomatonLayout } from "../automatonDesignQuestion";
import { checkDraft, initialDraft, labLayout, placeAt, placeState, snapPlace, stateNear, swapStates, FINE_STEP, SNAP, STATE_GAP, type LabDraft } from "./automataLab";
import AutomataLabTool from "./AutomataLabTool";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const three: LabDraft = { ...initialDraft("DFA"), states: ["q0", "q1", "q2"], accept: ["q2"], cells: { "q0|a": ["q1"], "q1|a": ["q2"] } };
const machine = (d: LabDraft) => { const c = checkDraft(d); if (!c.machine) throw new Error("not built"); return c.machine; };
const CELL = { w: 150, h: 120 }, R = 24;

describe("A16b — a place between the cells (pure)", () => {
  it("a point → its place: a fraction of the cells, two decimals, inside the grid", () => {
    expect(placeAt({ x: 225, y: 30 }, CELL)).toEqual([1.5, 0.25]);
    expect(placeAt({ x: 100, y: 100 }, CELL)).toEqual([0.67, 0.83]);
    expect(placeAt({ x: -400, y: 9000 }, CELL)).toEqual([0, 20]);
  });
  it("the state a place would crowd: closer than two radii and the gap, measured on the drawing; the moved state itself does not count", () => {
    const l = { q0: [0, 0] as [number, number], q1: [1, 0] as [number, number] };
    const edge = (2 * R + STATE_GAP) / CELL.w;                                       // the least clear distance, in cells
    expect([stateNear(l, [edge - 0.02, 0], CELL, R), stateNear(l, [edge + 0.02, 0], CELL, R), stateNear(l, [0.5, 3], CELL, R)]).toEqual(["q0", null, null]);
    expect([stateNear(l, [0.05, 0], CELL, R, "q0"), stateNear(l, [0.98, 0], CELL, R, "q0")]).toEqual([null, "q1"]);
  });
  it("snapping: another state's column or row first, else a whole cell's; each axis alone; far from every line, the place is kept", () => {
    const l = { q0: [0.4, 0] as [number, number], q1: [2, 1.3] as [number, number], me: [5, 5] as [number, number] };
    const d = (SNAP - 2) / CELL.w;
    expect(snapPlace([0.4 + d, 0.6], l, CELL, "me")).toEqual([0.4, 0.6]);            // q0's column; the row is far from every line
    expect(snapPlace([1.52, 1.3 + 0.03], l, CELL, "me")).toEqual([1.52, 1.3]);       // q1's row
    expect(snapPlace([3.03, 1.98], l, CELL, "me")).toEqual([3, 2]);                  // whole cells
    expect(snapPlace([4.97, 5.02], l, CELL, "me")).toEqual([5, 5]);                  // its own old place is not a line: the whole cell is
    expect(snapPlace([2.5, 2.5], l, CELL, "me")).toEqual([2.5, 2.5]);
  });
  it("a state placed keeps every other place (no swap); two states swapped; the same place changes nothing", () => {
    const now = labLayout(machine(three));
    expect(placeState(three, now, "q1", [1.37, 0.6]).layout).toEqual({ q0: [0, 0], q1: [1.37, 0.6], q2: [2, 0] });
    expect(placeState(three, now, "q1", [1, 0])).toBe(three);
    expect(placeState(three, now, "q1", [99, -3]).layout?.q1).toEqual([20, 0]);      // never outside the grid
    expect(swapStates({ ...three, layout: { q1: [1.37, 0.6] } }, { q0: [0, 0], q1: [1.37, 0.6], q2: [2, 0] }, "q0", "q1").layout).toEqual({ q0: [1.37, 0.6], q1: [0, 0], q2: [2, 0] });
    expect(swapStates(three, now, "q0", "q0")).toBe(three);
  });
  it("the automatic layout keeps clear of a state placed between the cells; places chosen are kept exactly", () => {
    const m = machine(three);
    const l = labLayout(m, { q2: [0.3, 0.2] });                                      // q2 crowds q0's automatic cell [0, 0]
    expect(l).toEqual({ q2: [0.3, 0.2], q0: [0, 1], q1: [1, 0] });
    expect(labLayout(m, { q0: [0.25, 0.5], q1: [1.75, 0.5], q2: [3.1, 0.5] })).toEqual({ q0: [0.25, 0.5], q1: [1.75, 0.5], q2: [3.1, 0.5] });
  });
  it("the scene draws a state exactly where its place says", () => {
    const m = machine(three);
    const whole = buildScene(m, { q0: [0, 0], q1: [1, 0], q2: [2, 0] });
    const free = buildScene(m, { q0: [0, 0], q1: [1.5, 0.25], q2: [2, 0] });
    expect(free.pos.q1).toEqual({ x: 1.5 * whole.cell.w, y: 0.25 * whole.cell.h });
    expect(free.edges.every(e => !/NaN/.test(e.d))).toBe(true);
  });
  it("the contract: a place the editor makes is one the answer's reader keeps as it is", () => {
    const made = placeState(three, labLayout(machine(three)), "q1", placeAt({ x: 213.7, y: 51.2 }, CELL)).layout!;
    expect(readAutomatonLayout(made, three.states)).toEqual(made);
  });
});

const ALL = { id: "automataLab" as const, kinds: ["DFA" as const, "NFA" as const, "PDA" as const, "TM" as const] };
const at = (el: HTMLElement, q: string) => { const c = [...el.querySelectorAll("g.learning-automaton-state")].find(g => g.querySelector("text")?.textContent === q)!.querySelector("circle")!; return { x: Number(c.getAttribute("cx")), y: Number(c.getAttribute("cy")) }; };

describe("A16b — the editor's keyboard", () => {
  it("an arrow key is a whole cell as before; Shift + an arrow key is a fine step; a neighbour stops a fine step (no swap)", () => {
    vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === "(pointer: fine)", media: q, addEventListener() {}, removeEventListener() {} })));
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: عدد a زوجي/ }));
    const canvas = screen.getByTestId("alab-canvas");
    fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "q1" } });
    const start = at(canvas, "q1"), cellW = start.x - at(canvas, "q0").x;            // q0 [0,0], q1 [1,0]
    fireEvent.keyDown(canvas, { key: "ArrowDown", shiftKey: true });
    const fine = at(canvas, "q1");
    expect(fine.x).toBe(start.x);
    expect(fine.y).toBeGreaterThan(start.y);
    fireEvent.keyDown(canvas, { key: "ArrowDown" });
    const whole = at(canvas, "q1");
    expect((whole.y - fine.y) / (fine.y - start.y)).toBeCloseTo(1 / FINE_STEP, 5);   // a whole cell is ten fine steps
    fireEvent.keyDown(canvas, { key: "ArrowUp" }); fireEvent.keyDown(canvas, { key: "ArrowUp", shiftKey: true });   // back beside q0
    expect(at(canvas, "q1")).toEqual(start);
    for (let k = 0; k < 12; k++) fireEvent.keyDown(canvas, { key: "ArrowLeft", shiftKey: true });   // towards q0, one cell away
    const stopped = at(canvas, "q1");
    expect(stopped.x).toBeGreaterThan(at(canvas, "q0").x + 2 * 20);                  // never on q0
    expect(stopped.x).toBeLessThan(start.x);
    expect(cellW).toBeGreaterThan(0);
    expect(screen.getByText("لا مكان هناك: q0 قريبة.")).toBeTruthy();
    expect(screen.queryByText(/تبادلت/)).toBeNull();
  });
});
