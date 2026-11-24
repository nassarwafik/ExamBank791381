// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import type { DsMark, DsObj, DsStep, DsTrace } from "../learning/activities/ds";
import DsTraceView from "../learning/activities/DsTraceView";
import LabTraceView from "./LabTraceView";
import { graphSentence, objectGraphOf, OG_NODES, OG_ROOTS, OG_ROWS, type OgNode } from "./objectGraph";
import { resetDeviceLabForTests, DESKTOP_QUERY } from "./deviceCSharpLab";

// Visual lab V10 (docs/enterprise-csharp-visual-lab-plan.md §20) — the object diagram of the visual run:
//   • which boxes: every object of the writer's classes, and each array / List / set / Dictionary connected to one; a plain int[] of
//     its own stays the row drawing; references (fields, cells) are arrows; sharing and cycles are drawn as they are;
//   • columns breadth first from the variables; bounded (boxes, rows, variables), what is left out counted and said;
//   • compared with the step before: the field / cell that changed is lit; a new object is «جديد»; the first step marks nothing;
//   • in the player: the «الكائنات» region holds the diagram (one img with the diagram in words), an array it draws is not drawn twice;
//     covered by «توقّع قبل أن ترى»; the course's trace view (no `heap`) keeps its list — a pin.
// The recorder's side (the graph it records, a cycle that no longer overflows) is proven in Chromium by tools/csharp-lab/golden.mjs.

afterEach(() => { cleanup(); resetDeviceLabForTests(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY, media: q, addEventListener() {}, removeEventListener() {} }))));

const v = (s: string) => ({ t: "v" as const, s });
const ref = (id: number) => ({ t: "ref" as const, id });
const step = (vars: DsStep["frames"][0]["vars"], objs: DsObj[], line = 1): DsStep => ({ line, note: "", frames: [{ name: "Main", vars }], objs, out: "", error: false });
// as the lab records the composite program of golden.mjs (V10): Person[] → Ali (Person), Sara (Student); one Address shared; int[] marks
const person = (id: number, type: string, name: string, age: string, home: number, marks: number, friend?: number): DsObj =>
  ({ id, k: "obj", type, fields: [["Name", v('"' + name + '"')], ["Age", v(age)], ["Home", ref(home)], ["Marks", ref(marks)], ...(friend ? [["Friend", ref(friend)] as [string, ReturnType<typeof ref>]] : [])] });
const WORLD = (age = "23", cell = "90"): DsObj[] => [
  { id: 1, k: "array", type: "Person[]", items: ["(Ali, 20, …)", "(Sara, " + age + ", …)"], refs: [2, 5] },
  person(2, "Person", "Ali", "20", 4, 3),
  { id: 3, k: "array", type: "int[]", items: ["0", cell, "0"] },
  { id: 4, k: "obj", type: "Address", fields: [["City", v('"Haifa"')]] },
  person(5, "Student", "Sara", age, 4, 6, 2),
  { id: 6, k: "array", type: "int[]", items: ["0", "0", "0"] },
];
const node = (g: ReturnType<typeof objectGraphOf>, id: number) => g!.nodes.find(n => n.id === id)!;
const row = (n: OgNode, key: string) => n.rows.find(r => r.key === key)!;

describe("V10 — which boxes, which arrows", () => {
  it("objects inside objects, an array of objects, an array inside an object, one object shared by two, a subclass's fields", () => {
    const g = objectGraphOf(step([["people", ref(1)]], WORLD()))!;
    expect(g.roots).toEqual([{ name: "people", top: true, target: 1 }]);
    expect(g.nodes.map(n => [n.id, n.kind, n.title, n.col])).toEqual([
      [1, "array", "Person[]", 1], [2, "obj", "Person", 2], [5, "obj", "Student", 2], [4, "obj", "Address", 3], [3, "array", "int[]", 3], [6, "array", "int[]", 3]]);
    // the array's cells are arrows to the two people; a field that refers to a box is an arrow (no text), a value is its text
    expect(node(g, 1).rows.map(r => [r.key, r.ref, r.text])).toEqual([["0", 2, ""], ["1", 5, ""]]);
    expect(node(g, 2).rows.map(r => [r.key, r.ref ?? r.text])).toEqual([["Name", '"Ali"'], ["Age", "20"], ["Home", 4], ["Marks", 3]]);
    expect(row(node(g, 5), "Home").ref).toBe(row(node(g, 2), "Home").ref);              // one Address, two arrows
    expect(node(g, 5).rows.map(r => r.key)).toEqual(["Name", "Age", "Home", "Marks", "Friend"]);   // inherited fields first
    expect(row(node(g, 5), "Friend").ref).toBe(2);
    expect(node(g, 3).rows.map(r => r.text)).toEqual(["0", "90", "0"]);
  });
  it("no object of the writer's classes → no diagram (a plain int[] / List<int> keeps its row drawing)", () => {
    expect(objectGraphOf(step([["a", ref(1)]], [{ id: 1, k: "array", type: "int[]", items: ["1"] }, { id: 2, k: "array", type: "List<int>", items: [] }]))).toBeNull();
    // … and an int[] NOT connected to any object stays out of a diagram that exists
    const g = objectGraphOf(step([["p", ref(4)], ["a", ref(9)]], [{ id: 4, k: "obj", type: "Address", fields: [["City", v('"x"')]] }, { id: 9, k: "array", type: "int[]", items: ["1"] }]))!;
    expect(g.nodes.map(n => n.id)).toEqual([4]);
    expect(g.roots.map(r => r.name)).toEqual(["p"]);
  });
  it("objects that refer to each other, and one that refers to itself: drawn once each, every arrow kept", () => {
    const pal = (id: number, other: number): DsObj => ({ id, k: "obj", type: "Pal", fields: [["Other", ref(other)]] });
    const g = objectGraphOf(step([["a", ref(1)], ["b", ref(2)]], [pal(1, 2), pal(2, 1), pal(3, 3)]))!;
    expect(g.nodes.map(n => [n.id, n.col])).toEqual([[1, 1], [2, 1], [3, 1]]);
    expect(g.nodes.map(n => n.rows[0].ref)).toEqual([2, 1, 3]);
  });
  it("a Dictionary of objects is a box of keys; a set's items; a reference to a structure drawn elsewhere says what it is", () => {
    const g = objectGraphOf(step([["m", ref(1)]], [
      { id: 1, k: "map", type: "Dictionary<string, Pal>", keys: ["x"], items: ["(…)"], refs: [2] },
      { id: 2, k: "obj", type: "Pal", fields: [["Todo", ref(3)], ["Tags", ref(4)]] },
      { id: 3, k: "stack", items: ["1", "2"] },
      { id: 4, k: "set", type: "HashSet<int>", items: ["7"] }]))!;
    expect(node(g, 1).rows).toEqual([{ key: "x", text: "", ref: 2, changed: false, marks: [] }]);
    expect(row(node(g, 2), "Todo")).toMatchObject({ ref: null, text: "→ راصّة [1,2]" });
    expect(node(g, 4).rows).toEqual([{ key: "•", text: "7", ref: null, changed: false, marks: [] }]);
  });
  it("an index variable pointing at an array's cell is marked on that row (a[i])", () => {
    const marks = new Map<number, DsMark[]>([[1, [{ name: "i", at: 1, top: true }]]]);
    const g = objectGraphOf(step([["people", ref(1)], ["i", v("1")]], WORLD()), undefined, marks)!;
    expect(node(g, 1).rows.map(r => r.marks)).toEqual([[], ["i"]]);
  });
});

describe("V10 — what changed in this step", () => {
  it("the field that changed is lit, and only it (not the array cell that refers to that object); the first step marks nothing", () => {
    const before = step([["people", ref(1)]], WORLD("22")), now = step([["people", ref(1)]], WORLD("23"));
    const g = objectGraphOf(now, before)!;
    expect(g.nodes.flatMap(n => n.rows.filter(r => r.changed).map(r => n.id + "." + r.key))).toEqual(["5.Age"]);
    expect(node(g, 1).changed).toBe(false);
    expect(node(g, 5).changed).toBe(true);
    expect(node(g, 2).changed).toBe(false);
    expect(objectGraphOf(now)!.nodes.some(n => n.changed || n.fresh || n.rows.some(r => r.changed))).toBe(false);
    expect(graphSentence(g)).toContain("تغيّر في هذه الخطوة: Student #5.Age.");
  });
  it("a cell of an array inside an object; a field that now refers to another object; an object `new` just made is «جديد»", () => {
    const g = objectGraphOf(step([["people", ref(1)]], WORLD("23", "95")), step([["people", ref(1)]], WORLD("23", "90")))!;
    expect(node(g, 3).rows.map(r => r.changed)).toEqual([false, true, false]);
    const a: DsObj = { id: 1, k: "obj", type: "Pal", fields: [["Other", { t: "null" }]] };
    const before = step([["a", ref(1)]], [a]);
    const after = step([["a", ref(1)]], [{ ...a, fields: [["Other", ref(2)]] }, { id: 2, k: "obj", type: "Pal", fields: [["Other", { t: "null" }]] }]);
    const h = objectGraphOf(after, before)!;
    expect(row(node(h, 1), "Other")).toMatchObject({ ref: 2, changed: true });
    expect([node(h, 1).fresh, node(h, 2).fresh]).toEqual([false, true]);
    expect(graphSentence(h)).toContain("Pal #2 (جديد): Other = null.");
  });
  it("an item added to a List of objects is a changed row", () => {
    const list = (refs: number[]): DsObj => ({ id: 1, k: "array", type: "List<Pal>", items: refs.map(() => "(…)"), refs });
    const pal = (id: number): DsObj => ({ id, k: "obj", type: "Pal", fields: [] });
    const g = objectGraphOf(step([["all", ref(1)]], [list([2, 3]), pal(2), pal(3)]), step([["all", ref(1)]], [list([2]), pal(2), pal(3)]))!;
    expect(node(g, 1).rows.map(r => r.changed)).toEqual([false, true]);
  });
});

describe("V10 — bounded, and says what it leaves out", () => {
  it(`at most ${OG_NODES} boxes, ${OG_ROWS} rows a box, ${OG_ROOTS} variables — the rest counted`, () => {
    const many: DsObj[] = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, k: "obj", type: "N", fields: [["Next", i < 29 ? ref(i + 2) : { t: "null" }]] }));
    const g = objectGraphOf(step([["head", ref(1)]], many))!;
    expect([g.nodes.length, g.hidden]).toEqual([OG_NODES, 30 - OG_NODES]);
    expect(row(node(g, OG_NODES), "Next")).toMatchObject({ ref: null, text: "#" + (OG_NODES + 1) });   // an arrow to a box left out: its name
    expect(graphSentence(g)).toContain("و" + (30 - OG_NODES) + " كائنات أخرى");
    const wide = objectGraphOf(step([["w", ref(1)]], [{ id: 1, k: "obj", type: "W", fields: Array.from({ length: 20 }, (_, i) => ["f" + i, v(String(i))] as [string, ReturnType<typeof v>]) }]))!;
    expect([wide.nodes[0].rows.length, wide.nodes[0].more]).toEqual([OG_ROWS, 20 - OG_ROWS]);
    const vars = Array.from({ length: 15 }, (_, i) => ["v" + i, ref(1)] as [string, ReturnType<typeof ref>]);
    expect(objectGraphOf(step(vars, [{ id: 1, k: "obj", type: "A", fields: [] }]))!.roots.length).toBe(OG_ROOTS);
  });
  it("the variables of the running method first; a caller's are kept, marked as not running", () => {
    const s: DsStep = { line: 1, note: "", out: "", error: false, objs: [{ id: 1, k: "obj", type: "A", fields: [] }],
      frames: [{ name: "Main", vars: [["a", ref(1)]] }, { name: "Show", vars: [["x", ref(1)]] }] };
    expect(objectGraphOf(s)!.roots).toEqual([{ name: "x", top: true, target: 1 }, { name: "a", top: false, target: 1 }]);
  });
});

const TRACE: DsTrace = {
  lines: ["static void Main()", "{", "    Person[] people = …;", "    people[1].Age = 23;", "}"],
  steps: [step([["people", ref(1)], ["n", ref(9)]], [...WORLD("22"), { id: 9, k: "array", type: "int[]", items: ["4"] }], 3),
    step([["people", ref(1)], ["n", ref(9)]], [...WORLD("23"), { id: 9, k: "array", type: "int[]", items: ["4"] }], 4)],
};

describe("V10 — in the player", () => {
  it("«الكائنات» holds the diagram: one img in words, the changed field lit; an array it draws is not drawn twice; a lone int[] still is", () => {
    render(<LabTraceView trace={TRACE} epoch={1} />);
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    const heap = screen.getByRole("region", { name: "الكائنات" });
    const img = within(heap).getByRole("img");
    expect(img.getAttribute("aria-label")).toMatch(/^مخطّط الكائنات\. people يشير إلى Person\[\] #1\./);
    expect(img.getAttribute("aria-label")).toContain("Student #5: Name = \"Sara\"، Age = 23، Home → Address #4، Marks → int[] #6، Friend → Person #2.");
    expect([...heap.querySelectorAll(".lab-og-row.is-changed")].map(r => r.nextElementSibling?.textContent)).toEqual(["Age"]);   // Sara's Age, lit
    expect(heap.querySelectorAll(".learning-trace-object").length).toBe(0);   // the list is replaced, not repeated
    const imgs = screen.getAllByRole("img").map(e => e.getAttribute("aria-label") || "");
    expect(imgs.filter(l => l.startsWith("المصفوفة people"))).toEqual([]);   // drawn in the diagram, not again as a row
    expect(imgs.some(l => l.startsWith("المصفوفة n (int[])"))).toBe(true);   // not connected to an object: still a row
  });
  it("«توقّع قبل أن ترى» covers the diagram too", () => {
    render(<LabTraceView trace={TRACE} epoch={1} />);
    fireEvent.click(screen.getByLabelText(/توقّع قبل أن ترى/));
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    expect(screen.getByTestId("lab-trace-guess")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "الكائنات" })).toBeNull();
  });
  it("pin: the course's trace view (no `heap`) keeps its «الكائنات» list and draws no diagram", () => {
    render(<DsTraceView cfg={TRACE} epoch={1} />);
    const heap = screen.getByRole("region", { name: "الكائنات" });
    expect(heap.querySelectorAll(".learning-trace-object").length).toBe(3);
    expect(within(heap).queryByRole("img")).toBeNull();
    expect(heap.querySelector(".lab-og")).toBeNull();
  });
});
