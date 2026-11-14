// DS-A1 — the data of the data-structure activities (ds.ts): the strict readers, the scene a program state is drawn as, and the
// binary-tree operations of the lab (the book's rules: smaller to the left; delete = leaf / one child / smallest of the right).
import { describe, it, expect } from "vitest";
import {
  bstDelete, bstInsert, bstSearch, isBst, keyAtPath, layoutBst, readDsFigure, readDsLab, readDsTrace, readLabValue, readTree, sceneOf, traverse,
  treeHeight, treeLeaves, treeSize, DS_LIMITS, type Bst, type DsFrame, type DsObj,
} from "./ds";

const v = (s: string) => ({ t: "v", s });
const ref = (id: number) => ({ t: "ref", id });
const TRACE = {
  code: "Stack<int> s = new Stack<int>();\ns.Push(5);\nConsole.WriteLine(s);",
  out: "[5]\n",
  steps: [
    { l: 1, n: "ننشئ راصّة فارغة باسم `s`.", o: 0, f: [{ name: "Main", vars: [["s", ref(1)]] }], h: [{ id: 1, k: "stack", items: [] }] },
    { l: 2, n: "ندخل `5` إلى رأس الراصّة `s`.", o: 0, h: [{ id: 1, k: "stack", items: ["5"] }] },
    { l: 3, n: "نطبع: `[5]`.", o: 4 },
  ],
};
const values = (t: Bst | null, how: "pre" | "in" | "post" | "level") => traverse(t, how).map(n => n.v).join(" ");
const tree = (raw: unknown) => readTree(raw) as Bst;

describe("readDsTrace", () => {
  it("reads a trace and carries unchanged frames / objects forward", () => {
    const t = readDsTrace(TRACE)!;
    expect(t.lines).toHaveLength(3);
    expect(t.steps.map(s => s.line)).toEqual([1, 2, 3]);
    expect(t.steps[2].frames).toEqual(t.steps[0].frames);                       // omitted → the previous step's
    expect(t.steps[2].objs).toEqual([{ id: 1, k: "stack", items: ["5"] }]);
    expect(t.steps.map(s => s.out)).toEqual(["", "", "[5]\n"]);
    expect(t.steps.every(s => !s.error)).toBe(true);
  });
  it("keeps `given` and `stdin`, and marks a run-time error step", () => {
    const t = readDsTrace({ ...TRACE, given: "الراصّة `s` فارغة.", stdin: "3", steps: [...TRACE.steps.slice(0, 2), { l: 3, n: "خطأ", o: 0, e: true }] })!;
    expect(t.given).toBe("الراصّة `s` فارغة.");
    expect(t.stdin).toBe("3");
    expect(t.steps[2].error).toBe(true);
  });
  it("allows line 0 (the closing step of a hidden driver) but no line outside the program", () => {
    expect(readDsTrace({ ...TRACE, steps: [...TRACE.steps, { l: 0, n: "انتهى التنفيذ.", o: 4 }] })).not.toBeNull();
    expect(readDsTrace({ ...TRACE, steps: [{ ...TRACE.steps[0], l: 4 }] })).toBeNull();
    expect(readDsTrace({ ...TRACE, steps: [{ ...TRACE.steps[0], l: -1 }] })).toBeNull();
  });
  it("refuses anything unexpected instead of guessing", () => {
    const first = TRACE.steps[0];
    const bad: unknown[] = [
      null, {}, { ...TRACE, code: "" }, { ...TRACE, steps: [] }, { ...TRACE, out: 5 },
      { ...TRACE, steps: [{ l: 1, n: "x", o: 0 }] },                                                                 // no frames / objects yet
      { ...TRACE, steps: [{ ...first, o: 99 }] },                                                                    // more output than there is
      { ...TRACE, steps: [first, { l: 2, n: "x", o: 3 }, { l: 3, n: "x", o: 1 }] },                                   // the output shrinks
      { ...TRACE, steps: [{ ...first, f: [{ name: "Main", vars: [["s", ref(9)]] }] }] },                             // a reference to nothing
      { ...TRACE, steps: [{ ...first, h: [{ id: 1, k: "stack", items: [] }, { id: 1, k: "queue", items: [] }] }] },   // an id twice
      { ...TRACE, steps: [{ ...first, h: [{ id: 1, k: "stack", items: [] }, { id: 2, k: "node", v: "3", next: 1 }] }] },   // a cell pointing at a stack
      { ...TRACE, steps: [{ ...first, h: [{ id: 1, k: "stack", items: [] }, { id: 2, k: "bin", v: "3", l: 7, r: null }] }] },
      { ...TRACE, steps: [{ ...first, h: [{ id: 1, k: "heap", items: [] }] }] },
      { ...TRACE, steps: [{ ...first, f: [{ name: "Main", vars: [["s", { t: "fn", s: "x" }]] }] }] },
      { ...TRACE, steps: Array.from({ length: DS_LIMITS.steps + 1 }, () => first) },
      { ...TRACE, code: Array.from({ length: DS_LIMITS.lines + 1 }, () => "x;").join("\n") },
    ];
    for (const c of bad) expect(readDsTrace(c), JSON.stringify(c)?.slice(0, 90)).toBeNull();
  });
});

describe("sceneOf — what a state is drawn as", () => {
  const frames: DsFrame[] = [
    { name: "Main", vars: [["chain", { t: "ref", id: 1 }], ["n", { t: "v", s: "3" }], ["st", { t: "ref", id: 9 }]] },
    { name: "Sum", vars: [["pos", { t: "ref", id: 2 }], ["chain", { t: "ref", id: 1 }]] },
  ];
  const objs: DsObj[] = [
    { id: 1, k: "node", v: "13", next: 2 }, { id: 2, k: "node", v: "15", next: 3 }, { id: 3, k: "node", v: "17", next: null },
    { id: 9, k: "stack", items: ["4", "3"] }, { id: 10, k: "queue", items: [] },
  ];
  it("draws each chain from the cell nothing points at, with the names pointing at its cells (the running method's marked)", () => {
    const s = sceneOf(frames, objs);
    expect(s.chains).toHaveLength(1);
    expect(s.chains[0].end).toBe("null");
    expect(s.chains[0].nodes.map(n => n.v)).toEqual(["13", "15", "17"]);
    expect(s.chains[0].nodes[0].labels).toEqual([{ name: "chain", top: true }]);     // the same name in two frames is one label
    expect(s.chains[0].nodes[1].labels).toEqual([{ name: "pos", top: true }]);
    expect(s.stacks).toEqual([{ id: 9, items: ["4", "3"], labels: [{ name: "st", top: false }] }]);
    expect(s.queues).toEqual([{ id: 10, items: [], labels: [] }]);
  });
  it("a second chain that runs into a drawn cell says where it joins; a ring says where it returns", () => {
    const joined = sceneOf([], [...objs.slice(0, 3), { id: 4, k: "node", v: "99", next: 2 }]);
    expect(joined.chains.map(c => [c.nodes.map(n => n.v).join(">"), c.end, c.join])).toEqual([["13>15>17", "null", undefined], ["99", "join", "15"]]);
    const ring = sceneOf([], [{ id: 1, k: "node", v: "a", next: 2 }, { id: 2, k: "node", v: "b", next: 1 }]);
    expect(ring.chains).toHaveLength(1);
    expect([ring.chains[0].nodes.map(n => n.v).join(">"), ring.chains[0].end, ring.chains[0].join]).toEqual(["a>b", "cycle", "a"]);
  });
  it("lays a tree out in in-order columns and levels, from the cell that is nobody's child", () => {
    const s = sceneOf([{ name: "Main", vars: [["bt", { t: "ref", id: 3 }]] }], [
      { id: 1, k: "bin", v: "3", l: null, r: null }, { id: 2, k: "bin", v: "7", l: null, r: null }, { id: 3, k: "bin", v: "5", l: 1, r: 2 },
    ]);
    expect(s.trees).toHaveLength(1);
    expect(s.trees[0].nodes.map(n => [n.v, n.x, n.depth, n.parent])).toEqual([["3", 0, 1, 3], ["5", 1, 0, null], ["7", 2, 1, 3]]);
    expect(s.trees[0].nodes[1].labels).toEqual([{ name: "bt", top: true }]);
  });
  it("lists plain objects for the «الكائنات» panel", () => {
    const s = sceneOf([], [{ id: 5, k: "obj", type: "Student", fields: [["name", { t: "v", s: "\"Rami\"" }]] }]);
    expect(s.objects.map(o => o.type)).toEqual(["Student"]);
  });
});

describe("trees", () => {
  const T = tree([50, [30, 10, 40], [70, 60, 80]]);
  it("reads [value, left, right] with stable keys; refuses a malformed tree", () => {
    expect(values(T, "pre")).toBe("50 30 10 40 70 60 80");
    expect(traverse(T, "pre").map(n => n.key)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(readTree(null)).toBeNull();
    expect(readTree([1, 2, 3, 4])).toBeUndefined();
    expect(readTree([{ a: 1 }])).toBeUndefined();
    expect(readTree(Array.from({ length: 1 }, () => [1, [2, [3, [4, [5, [6, [7, 8]]]]]]])[0])).toBeUndefined();   // deeper than the lab draws
  });
  it("the four traversals, the size, the height (book: empty −1, one cell 0) and the leaves", () => {
    expect(values(T, "in")).toBe("10 30 40 50 60 70 80");
    expect(values(T, "post")).toBe("10 40 30 60 80 70 50");
    expect(values(T, "level")).toBe("50 30 70 10 40 60 80");
    expect([treeSize(T), treeHeight(T), treeHeight(tree(5)), treeHeight(null)]).toEqual([7, 2, 0, -1]);
    expect(treeLeaves(T).map(n => n.v)).toEqual(["10", "40", "60", "80"]);
    expect(layoutBst(T).map(n => [n.node.v, n.x, n.depth])).toEqual([["10", 0, 2], ["30", 1, 1], ["40", 2, 2], ["50", 3, 0], ["60", 4, 2], ["70", 5, 1], ["80", 6, 2]]);
    expect(keyAtPath(T, "")).toBe(1);
    expect(keyAtPath(T, "RL")).toBe(6);
    expect(keyAtPath(T, "LLL")).toBeNull();
  });
  it("search follows one path; insert adds a leaf where the search ended, never a value twice", () => {
    expect(bstSearch(T, 60).path.map(n => n.v)).toEqual(["50", "70", "60"]);
    expect(bstSearch(T, 60).found).toBe(true);
    expect(bstSearch(T, 65)).toMatchObject({ found: false });
    const ins = bstInsert(T, 65, 99);
    expect(ins.inserted).toBe(true);
    expect(values(ins.tree, "in")).toBe("10 30 40 50 60 65 70 80");
    expect(isBst(ins.tree)).toBe(true);
    expect(T.r!.l!.r).toBeNull();                                                  // the old tree is untouched
    expect(bstInsert(T, 40, 99).inserted).toBe(false);
  });
  it("delete: a leaf, a cell with one child, a cell with two children (the smallest of its right subtree) — the book's three cases", () => {
    const leaf = bstDelete(tree([50, [30, 10, 40], 70]), 10);
    expect([leaf.kind, values(leaf.tree, "pre")]).toEqual(["leaf", "50 30 40 70"]);
    const one = bstDelete(tree([50, [30, null, 40], [70, 60, 80]]), 30);
    expect([one.kind, values(one.tree, "pre")]).toEqual(["one", "50 40 70 60 80"]);
    const two = bstDelete(tree([50, 40, [70, 60, 80]]), 50);
    expect([two.kind, two.successor, values(two.tree, "pre")]).toEqual(["two", "60", "60 40 70 80"]);
    expect(isBst(two.tree)).toBe(true);
    expect(bstDelete(T, 99)).toMatchObject({ found: false, tree: T });
    expect(bstDelete(tree(5), 5).tree).toBeNull();
  });
  it("isBst: in-order strictly increasing", () => {
    expect(isBst(T)).toBe(true);
    expect(isBst(tree([50, [30, 10, 60], 70]))).toBe(false);                        // 60 is in the left subtree of 50
    expect(isBst(tree([5, 5, null]))).toBe(false);
  });
});

describe("readDsLab / readLabValue / readDsFigure", () => {
  it("reads each structure with its defaults", () => {
    expect(readDsLab({ structure: "stack", values: [1, 2, 3] })).toEqual({ structure: "stack", valueType: "int", name: "s", values: ["1", "2", "3"] });
    expect(readDsLab({ structure: "queue", valueType: "char", values: ["a", "b"], name: "q1" })).toEqual({ structure: "queue", valueType: "char", name: "q1", values: ["a", "b"] });
    expect(readDsLab({ structure: "chain" })).toEqual({ structure: "chain", valueType: "int", name: "chain", values: [] });
    expect(readDsLab({ structure: "bst", tree: [5, 3, 7] })).toMatchObject({ structure: "bst", name: "t" });
    expect(readDsLab({ structure: "tree" })).toMatchObject({ structure: "tree", tree: null });
  });
  it("refuses a bad structure, a bad value, a bad name, too many values, a search tree that is not one", () => {
    for (const c of [{}, { structure: "heap" }, { structure: "stack", values: ["x"] }, { structure: "stack", values: Array(9).fill(1) }, { structure: "stack", name: "1s" },
      { structure: "queue", valueType: "float" }, { structure: "bst", tree: [5, 7, 3] }, { structure: "tree", tree: [5, "a", null] }]) expect(readDsLab(c), JSON.stringify(c)).toBeNull();
  });
  it("a typed value is checked by the element type", () => {
    expect([readLabValue(" 07 ", "int"), readLabValue("-3", "int"), readLabValue("1234", "int"), readLabValue("a", "int")]).toEqual(["7", "-3", null, null]);
    expect([readLabValue("a", "char"), readLabValue("ab", "char"), readLabValue("(", "char")]).toEqual(["a", null, "("]);
    expect([readLabValue("سارة", "string"), readLabValue("a b", "string"), readLabValue("", "string")]).toEqual(["سارة", null, null]);
  });
  it("reads figure panels: pointers and highlights by index (chain) or by path (tree)", () => {
    const f = readDsFigure({ panels: [
      { kind: "stack", items: [4, 3], label: "قبل" }, { kind: "queue", items: [] },
      { kind: "chain", items: [13, 15, 17], pointers: [["chain", 0], ["pos", 2]], hi: [1] },
      { kind: "tree", tree: [5, 3, [7, null, 9]], pointers: [["bt", ""]], hi: ["RR"], facts: true },
    ] })!;
    expect(f.panels.map(p => p.kind)).toEqual(["stack", "queue", "chain", "tree"]);
    expect(f.panels[0]).toEqual({ kind: "stack", label: "قبل", items: ["4", "3"] });
    expect(f.panels[2]).toMatchObject({ pointers: [["chain", 0], ["pos", 2]], hi: [1] });
    expect(f.panels[3]).toMatchObject({ pointers: [["bt", 1]], hi: [4], facts: true });
  });
  it("refuses a figure with no panel, too many, a pointer outside the chain or a path outside the tree", () => {
    for (const c of [{}, { panels: [] }, { panels: Array(5).fill({ kind: "stack", items: [] }) }, { panels: [{ kind: "chain", items: [1], pointers: [["p", 3]] }] },
      { panels: [{ kind: "tree", tree: [5, 3, 7], hi: ["LL"] }] }, { panels: [{ kind: "tree", tree: [5, 3, 7], pointers: [["p p", "L"]] }] }, { panels: [{ kind: "pie", items: [] }] }]) expect(readDsFigure(c), JSON.stringify(c)).toBeNull();
  });
});
