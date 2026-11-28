// @vitest-environment happy-dom
// AUTO-A16c (docs/enterprise-automata-lab-a4.md §26) — an arrow bent by hand, and «تراجع» / «إعادة»:
//   • pure: the bend a pointer asks for (signed, bounded, straight near the line; a loop's angle), one step of the buttons, a bend set and
//     given back; a removed arrow or state takes its bends; the scene draws the bend it is given and its own otherwise; the history;
//   • the editor: «تراجع» / «إعادة» step through changes made on the drawing AND in the table, Ctrl+Z / Ctrl+Y too; a new change empties
//     «إعادة»; the arrow's window bends its arrow with no drag and gives it back to the automatic drawing;
//   • the exam: a bend is never part of the answer, and «تراجع» saves the machine it brings back.
// Real drags of an arrow (it bends, the frame held still, one step of history) are proven in real Chromium: scripts/check-automata-lab-browser.mjs.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { buildScene } from "../learning/activities/automatonScene";
import {
  addArrow, bendAt, bendStep, checkDraft, initialDraft, labLayout, removeArrow, removeState, setBend, startHistory, stepHistory,
  BEND_MAX, BEND_SNAP, BEND_STEP, HISTORY_MAX, LOOP_STEP, type LabDraft,
} from "./automataLab";
import { copyDraft } from "./automataLabHandoff";
import AutomataLabTool from "./AutomataLabTool";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const three: LabDraft = { ...initialDraft("DFA"), states: ["q0", "q1", "q2"], accept: ["q2"], cells: { "q0|a": ["q1"], "q1|a": ["q2"], "q2|b": ["q2"] } };
const machine = (d: LabDraft) => { const c = checkDraft(d); if (!c.machine) throw new Error("not built"); return c.machine; };

describe("A16c — a bend (pure)", () => {
  const a = { x: 0, y: 0 }, b = { x: 200, y: 0 };                                    // a → b to the right: its left-hand normal points down the screen (+y)
  it("the bend a pointer asks for: how far from the line's middle along the normal, signed, whole, bounded; straight near the line", () => {
    expect([bendAt({ x: 100, y: 40 }, a, b), bendAt({ x: 100, y: -40.4 }, a, b), bendAt({ x: 30, y: 40 }, a, b)]).toEqual([40, -40, 40]);
    expect([bendAt({ x: 100, y: BEND_SNAP - 1 }, a, b), bendAt({ x: 100, y: 9000 }, a, b), bendAt({ x: 100, y: -9000 }, a, b)]).toEqual([0, BEND_MAX, -BEND_MAX]);
  });
  it("a loop: the angle of the pointer around its state, two decimals", () => {
    expect([bendAt({ x: 50, y: 0 }, a, a), bendAt({ x: 0, y: -50 }, a, a), bendAt({ x: -50, y: 0 }, a, a)]).toEqual([0, -1.57, 3.14]);
  });
  it("one step of the buttons: an arrow by BEND_STEP inside the bounds, a loop by an eighth of a turn (wrapping)", () => {
    expect([bendStep(0, false, 1), bendStep(26, false, -1), bendStep(BEND_MAX - 5, false, 1), bendStep(-BEND_MAX, false, -1)]).toEqual([BEND_STEP, 26 - BEND_STEP, BEND_MAX, -BEND_MAX]);
    expect(bendStep(0, true, 1)).toBeCloseTo(LOOP_STEP, 2);
    expect(bendStep(3.14, true, 1)).toBeCloseTo(-3.14 + 0.79, 1);                   // past half a turn: around the other way
  });
  it("a bend set, replaced and given back; the same bend or a number that is not finite changes nothing", () => {
    const one = setBend(three, "q0", "q1", 40);
    expect(one.bends).toEqual({ "q0 q1": 40 });
    expect([setBend(one, "q0", "q1", 40), setBend(one, "q0", "q1", NaN), setBend(three, "q0", "q1", undefined)]).toEqual([one, one, three]);
    expect(setBend(one, "q1", "q2", -12).bends).toEqual({ "q0 q1": 40, "q1 q2": -12 });
    const back = setBend(one, "q0", "q1", undefined);
    expect("bends" in back).toBe(false);                                             // no empty field left behind
    expect(back.cells).toBe(three.cells);
  });
  it("a removed arrow takes its bend; a removed state takes the bends of its arrows; a copy for the lab has its own bends", () => {
    const d = setBend(setBend(setBend(three, "q0", "q1", 40), "q1", "q2", -30), "q2", "q2", 1.2);
    expect(removeArrow(d, "q0", "q1").bends).toEqual({ "q1 q2": -30, "q2 q2": 1.2 });
    expect(removeArrow(d, "q0", "q2")).toBe(d);                                      // no such arrow
    expect(removeState(d, "q2").bends).toEqual({ "q0 q1": 40 });
    const c = copyDraft(d);
    expect([c.bends, c.bends === d.bends]).toEqual([d.bends, false]);
  });
  it("a push-down automaton's and a Turing machine's arrows: the bend goes with every row of the arrow", () => {
    const pda = setBend(addArrow(addArrow({ ...initialDraft("PDA"), states: ["q0", "q1"] }, "q0", "q1"), "q0", "q1"), "q0", "q1", 50);
    expect("bends" in removeArrow(pda, "q0", "q1")).toBe(false);
  });
});

describe("A16c — the scene draws the bend it is given", () => {
  const m = machine(three), l = labLayout(m);
  const edge = (bends?: Record<string, number>) => Object.fromEntries(buildScene(m, l, bends).edges.map(e => [e.e.key, e]));
  it("no bend given: the automatic drawing, and what it is (a straight arrow is 0)", () => {
    expect(edge()["q0 q1"].d).toMatch(/^M [-\d.]+ [-\d.]+ L /);
    expect([edge()["q0 q1"].bend, edge({})["q0 q1"].d]).toEqual([0, edge()["q0 q1"].d]);
  });
  it("a bend given: a curve to that side, its label on the same side; the other arrows as they were; 0 is a straight arrow", () => {
    const plain = edge(), down = edge({ "q0 q1": 40 }), up = edge({ "q0 q1": -40 });
    expect([down["q0 q1"].d, down["q0 q1"].bend]).toEqual([expect.stringMatching(/ Q /), 40]);
    expect(down["q0 q1"].label.at.y).toBeGreaterThan(plain["q0 q1"].label.at.y);     // q0 → q1 runs to the right: +40 bulges down the screen
    expect(up["q0 q1"].label.at.y).toBeLessThan(plain["q0 q1"].label.at.y);
    expect(up["q0 q1"].label.at.y).toBeCloseTo(-down["q0 q1"].label.at.y, 5);        // the label is OUTSIDE the curve on either side (the line is y = 0)
    expect([up["q0 q1"].label.grow, down["q0 q1"].label.grow]).toEqual(["up", "down"]);
    expect(down["q1 q2"].d).toBe(plain["q1 q2"].d);
    const pair = { ...three, cells: { ...three.cells, "q1|b": ["q0"] } };           // q0 ⇄ q1: bent apart automatically (26)
    const auto = buildScene(machine(pair), l).edges.find(e => e.e.key === "q0 q1")!;
    const flat = buildScene(machine(pair), l, { "q0 q1": 0 }).edges.find(e => e.e.key === "q0 q1")!;
    expect([auto.bend, auto.d, flat.d]).toEqual([26, expect.stringMatching(/ Q /), expect.stringMatching(/ L /)]);
  });
  it("a loop turns to the angle given; a value that is not a finite number is ignored", () => {
    const plain = edge(), turned = edge({ "q2 q2": 0 });                             // 0: to the right of q2
    expect(turned["q2 q2"].bend).toBe(0);
    expect(turned["q2 q2"].label.at.x).toBeGreaterThan(plain["q2 q2"].label.at.x);
    expect(edge({ "q0 q1": NaN, "q2 q2": "up" as unknown as number })["q0 q1"].d).toBe(plain["q0 q1"].d);
    expect(buildScene(m, l, { "q9 q9": 40, "q0 q1": 40 }).edges.every(e => !/NaN/.test(e.d))).toBe(true);
  });
});

describe("A16c — «تراجع» / «إعادة» (pure)", () => {
  const d = (n: number): LabDraft => ({ ...three, states: ["q" + n] });
  it("a change is a step; «تراجع» keeps it for «إعادة»; «إعادة» brings it back; a new change empties «إعادة»", () => {
    const [a, b, c] = [d(1), d(2), d(3)];
    let h = stepHistory(stepHistory(startHistory(a), b, false), c, false);
    expect([h.past, h.future, h.last]).toEqual([[a, b], [], c]);
    h = stepHistory({ ...h, jump: "undo" }, b, false);
    expect([h.past, h.future, h.last, h.jump]).toEqual([[a], [c], b, null]);
    h = stepHistory({ ...h, jump: "redo" }, c, false);
    expect([h.past, h.future, h.last]).toEqual([[a, b], [], c]);
    h = stepHistory(stepHistory({ ...h, jump: "undo" }, b, false), d(4), false);
    expect([h.past, h.future]).toEqual([[a, b], []]);
  });
  it("one drag is one step, however many changes it makes; the same draft is no step; the oldest step is dropped past the limit", () => {
    const [a, b, c, e] = [d(1), d(2), d(3), d(4)];
    let h = stepHistory(stepHistory(stepHistory(startHistory(a), b, true), c, true), e, true);
    expect([h.past, h.last, h.held]).toEqual([[a], e, true]);
    expect(stepHistory(h, e, false)).toBe(h);
    h = startHistory(d(0));
    for (let k = 1; k <= HISTORY_MAX + 5; k++) h = stepHistory(h, d(k), false);
    expect([h.past.length, h.past[0].states[0]]).toEqual([HISTORY_MAX, "q5"]);
  });
});

const ALL = { id: "automataLab" as const, kinds: ["DFA" as const, "NFA" as const, "PDA" as const, "TM" as const] };
const open = () => {
  vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === "(pointer: fine)", media: q, addEventListener() {}, removeEventListener() {} })));
  render(<AutomataLabTool config={ALL} />);
  fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: عدد a زوجي/ }));  // q0 —a→ q1, q0 —b→ q0, q1 —a→ q0, q1 —b→ q1
  return screen.getByTestId("alab-canvas");
};
const tools = () => screen.getByRole("group", { name: "أدوات الرسم" });
const btn = (name: string) => within(tools()).getByRole("button", { name }) as HTMLButtonElement;
const cell = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
const path = (canvas: HTMLElement, key: string) => canvas.querySelector("g[data-edge='" + key + "'] path.learning-automaton-edge")!.getAttribute("d")!;

describe("A16c — the editor", () => {
  it("«تراجع» / «إعادة»: changes made on the drawing and in the table, one step each; a new change empties «إعادة»", () => {
    open();
    expect([btn("تراجع").disabled, btn("إعادة").disabled]).toEqual([false, true]);    // opening the example was a step
    fireEvent.change(cell("من q0 بالرمز b إلى"), { target: { value: "q1" } });         // in the table
    fireEvent.change(within(tools()).getByLabelText("الحالة"), { target: { value: "q1" } });
    fireEvent.click(btn("قبول"));                                                     // on the drawing's tools
    expect((screen.getAllByRole("checkbox", { name: "قبول" })[1] as HTMLInputElement).checked).toBe(true);
    fireEvent.click(btn("تراجع"));
    expect((screen.getAllByRole("checkbox", { name: "قبول" })[1] as HTMLInputElement).checked).toBe(false);
    expect(cell("من q0 بالرمز b إلى").value).toBe("q1");
    fireEvent.click(btn("تراجع"));
    expect(cell("من q0 بالرمز b إلى").value).toBe("q0");                               // the table's change undone too
    expect(screen.getByText("تراجعت خطوة.")).toBeTruthy();
    fireEvent.click(btn("إعادة"));
    expect(cell("من q0 بالرمز b إلى").value).toBe("q1");
    expect(btn("إعادة").disabled).toBe(false);
    fireEvent.change(cell("من q1 بالرمز b إلى"), { target: { value: "q0" } });         // a new change
    expect(btn("إعادة").disabled).toBe(true);
  });
  it("Ctrl+Z and Ctrl+Y (and Ctrl+Shift+Z) on the drawing; nothing to undo changes nothing", () => {
    const canvas = open();
    fireEvent.change(cell("من q0 بالرمز b إلى"), { target: { value: "q1" } });
    fireEvent.keyDown(canvas, { key: "z", ctrlKey: true });
    expect(cell("من q0 بالرمز b إلى").value).toBe("q0");
    fireEvent.keyDown(canvas, { key: "y", ctrlKey: true });
    expect(cell("من q0 بالرمز b إلى").value).toBe("q1");
    fireEvent.keyDown(canvas, { key: "z", ctrlKey: true });
    fireEvent.keyDown(canvas, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(cell("من q0 بالرمز b إلى").value).toBe("q1");
    fireEvent.keyDown(canvas, { key: "y", ctrlKey: true });                           // nothing to redo
    expect(cell("من q0 بالرمز b إلى").value).toBe("q1");
  });
  it("the arrow's window bends its arrow with no drag, both ways, and gives it back to the automatic drawing; «تراجع» undoes a bend", () => {
    const canvas = open();
    const auto = path(canvas, "q0 q1");
    fireEvent.change(within(tools()).getByLabelText("سهم إلى"), { target: { value: "q1" } });
    const win = () => screen.getByRole("group", { name: "رمز السهم من q0 إلى q1" });
    const bend = () => within(win()).getByRole("group", { name: "انحناء السهم" });
    expect((within(bend()).getByRole("button", { name: "تلقائي" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(bend()).getByRole("button", { name: "اثنِ السهم إلى الجهة الأخرى" }));
    const more = path(canvas, "q0 q1");
    expect(more).not.toBe(auto);
    fireEvent.click(within(bend()).getByRole("button", { name: "اثنِ السهم إلى جهة" }));
    expect(path(canvas, "q0 q1")).toBe(auto);                                         // one step each way: the automatic bend's value again
    fireEvent.click(within(bend()).getByRole("button", { name: "اثنِ السهم إلى جهة" }));
    expect(path(canvas, "q0 q1")).not.toBe(auto);
    fireEvent.click(within(bend()).getByRole("button", { name: "تلقائي" }));
    expect(path(canvas, "q0 q1")).toBe(auto);
    expect(screen.getByText("عاد السهم إلى انحنائه التلقائي.")).toBeTruthy();
    fireEvent.click(within(bend()).getByRole("button", { name: "اثنِ السهم إلى الجهة الأخرى" }));
    fireEvent.click(btn("تراجع"));
    expect(path(canvas, "q0 q1")).toBe(auto);
    expect(cell("من q0 بالرمز a إلى").value).toBe("q1");                               // the machine itself was never touched
  });
  it("a loop's window turns the loop; «تراجع» brings a removed state and its arrows back", () => {
    const canvas = open();
    fireEvent.change(within(tools()).getByLabelText("سهم إلى"), { target: { value: "q0" } });   // q0 —b→ q0
    const loopWin = screen.getByRole("group", { name: "رمز السهم من q0 إلى q0" });
    const before = path(canvas, "q0 q0");
    fireEvent.click(within(within(loopWin).getByRole("group", { name: "مكان الحلقة" })).getByRole("button", { name: "أدِر الحلقة مع عقارب الساعة" }));
    expect(path(canvas, "q0 q0")).not.toBe(before);
    fireEvent.change(within(tools()).getByLabelText("الحالة"), { target: { value: "q1" } });
    fireEvent.click(within(tools()).getByRole("button", { name: "حذف" }));           // only q0 left, with its loop
    fireEvent.click(btn("تراجع"));                                                    // q1 and its arrows are back
    expect(cell("من q1 بالرمز a إلى").value).toBe("q0");
  });
});
