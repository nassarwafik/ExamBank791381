// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { readDsTrace, sceneOf, DS_LIMITS, type DsObj, type DsFrame } from "../learning/activities/ds";
import DsTraceView from "../learning/activities/DsTraceView";
import { readLabTrace } from "./labTrace";

// Visual lab V5 (docs/enterprise-csharp-visual-lab-plan.md §13) — rich types, the teacher's visual run only:
//   • the strict v2 reader: `refs` / `ref`, the kinds array / set / map and `pointers` are read ONLY with `rich`; without it (every
//     course trace) any of them makes the trace unreadable — a course trace reads exactly as before (pins);
//   • what is drawn: an item that refers to an object («→#id», the object named «#id»), Stack<Queue<int>>, Queue<Student>,
//     Node<Student>; an array with its indices and the index variable that points at a cell; a set; a dictionary;
//   • the lab's reader: a reference to an object dropped for space becomes a plain value, and says so.
// The recorder's side (option `rich`) is proven in Chromium by tools/csharp-lab/golden.mjs.

afterEach(cleanup);
const main = (vars: DsFrame["vars"] = []): DsFrame[] => [{ name: "Main", vars }];
const trace = (h: unknown[], extra: Record<string, unknown> = {}, f: unknown = main()) => ({ code: "a\nb\nc", out: "", steps: [{ l: 1, n: "", f, h, o: 0 }], ...extra });

describe("V5 — the strict v2 reader", () => {
  const stackOfQueues = [{ id: 1, k: "stack", items: ["[3]", "[1,2]"], refs: [2, 3] }, { id: 2, k: "queue", items: ["3"] }, { id: 3, k: "queue", items: ["1", "2"] }];
  it("rich: refs, ref, array / set / map and pointers are read", () => {
    const t = readDsTrace(trace([...stackOfQueues, { id: 4, k: "array", type: "int[]", items: ["5", "3"] }, { id: 5, k: "set", type: "HashSet<int>", items: ["4"] },
      { id: 6, k: "map", type: "Dictionary<string, int>", keys: ["a"], items: ["7"] }, { id: 7, k: "node", v: "Omar", next: null, ref: 8 },
      { id: 8, k: "obj", type: "Student", fields: [["Name", { t: "v", s: "\"Omar\"" }]] }], { pointers: [["a", "i"]] }), undefined, true)!;
    expect(t.steps[0].objs.map(o => o.k)).toEqual(["stack", "queue", "queue", "array", "set", "map", "node", "obj"]);
    expect(t.steps[0].objs[0]).toEqual({ id: 1, k: "stack", items: ["[3]", "[1,2]"], refs: [2, 3] });
    expect(t.pointers).toEqual([["a", "i"]]);
  });
  it("without rich (every course trace) any v2 part makes the trace unreadable", () => {
    expect(readDsTrace(trace(stackOfQueues))).toBeNull();
    expect(readDsTrace(trace([{ id: 1, k: "node", v: "x", next: null, ref: 1 }]))).toBeNull();
    expect(readDsTrace(trace([{ id: 1, k: "array", type: "int[]", items: [] }]))).toBeNull();
    expect(readDsTrace(trace([{ id: 1, k: "map", type: "D", keys: [], items: [] }]))).toBeNull();
    expect(readDsTrace(trace([], { pointers: [["a", "i"]] }))).toBeNull();
  });
  it("pin: a v1 trace reads exactly the same with or without rich", () => {
    const v1 = trace([{ id: 1, k: "stack", items: ["2", "1"] }, { id: 2, k: "node", v: "5", next: null }], {}, main([["s", { t: "ref", id: 1 }]]));
    expect(readDsTrace(v1)).toEqual(readDsTrace(v1, undefined, true));
    expect(readDsTrace(v1)!.steps[0].objs).toEqual([{ id: 1, k: "stack", items: ["2", "1"] }, { id: 2, k: "node", v: "5", next: null }]);
  });
  it("rich is still strict: refs the wrong length, a ref to nothing, keys and values unequal, a bad pointer → unreadable", () => {
    const rich = (h: unknown[], extra?: Record<string, unknown>) => readDsTrace(trace(h, extra), undefined, true);
    expect(rich([{ id: 1, k: "stack", items: ["a", "b"], refs: [null] }])).toBeNull();
    expect(rich([{ id: 1, k: "stack", items: ["a"], refs: [9] }])).toBeNull();
    expect(rich([{ id: 1, k: "stack", items: ["a"], refs: ["2"] }])).toBeNull();
    expect(rich([{ id: 1, k: "node", v: "a", next: null, ref: 9 }])).toBeNull();
    expect(rich([{ id: 1, k: "obj", type: "P", fields: [], refs: [] }])).toBeNull();
    expect(rich([{ id: 1, k: "map", type: "D", keys: ["a", "b"], items: ["1"] }])).toBeNull();
    expect(rich([{ id: 1, k: "array", type: "x".repeat(DS_LIMITS.text + 1), items: [] }])).toBeNull();
    expect(rich([], { pointers: [["a[0]", "i"]] })).toBeNull();
    expect(rich([], { pointers: Array.from({ length: 21 }, () => ["a", "i"]) })).toBeNull();
  });
});

describe("V5 — what is drawn", () => {
  it("Stack<Queue<int>>: each item says the queue it refers to; each queue is drawn and named «#id»", () => {
    const objs: DsObj[] = [{ id: 1, k: "stack", items: ["[3]", "[1,2]"], refs: [2, 3] }, { id: 2, k: "queue", items: ["3"] }, { id: 3, k: "queue", items: ["1", "2"] }];
    const scene = sceneOf(main([["s", { t: "ref", id: 1 }]]), objs);
    expect(scene.stacks[0].items).toEqual(["[3] →#2", "[1,2] →#3"]);
    expect(scene.queues.map(q => q.labels.map(l => l.name))).toEqual([["#2"], ["#3"]]);
  });
  it("Queue<Student> / Node<Student>: the item / the cell says its Student, and the Student is named «#id»", () => {
    const objs: DsObj[] = [{ id: 1, k: "queue", items: ["(Ali, 92)"], refs: [2] }, { id: 2, k: "obj", type: "Student", fields: [] },
      { id: 3, k: "node", v: "Omar", next: null, ref: 4 }, { id: 4, k: "obj", type: "Student", fields: [] }];
    const scene = sceneOf(main(), objs);
    expect(scene.queues[0].items).toEqual(["(Ali, 92) →#2"]);
    expect(scene.chains[0].nodes[0].v).toEqual("Omar →#4");
    expect(scene.objects.map(o => o.id)).toEqual([2, 4]);
  });
  it("an array: indices, and the index variable of a[i] marks the cell it holds (only a whole number in range)", () => {
    const objs: DsObj[] = [{ id: 1, k: "array", type: "int[]", items: ["5", "3", "8"] }, { id: 2, k: "array", type: "LinkedList<int>", items: ["1"] }];
    const frames = main([["a", { t: "ref", id: 1 }], ["i", { t: "v", s: "1" }], ["j", { t: "v", s: "2.5" }], ["k", { t: "v", s: "7" }], ["l", { t: "ref", id: 2 }], ["m", { t: "v", s: "0" }]]);
    const scene = sceneOf(frames, objs, [["a", "i"], ["a", "j"], ["a", "k"], ["l", "m"]]);
    expect(scene.rows[0]).toMatchObject({ indexed: true, marks: [{ name: "i", at: 1, top: true }], labels: [{ name: "a" }] });
    expect(scene.rows[1]).toMatchObject({ indexed: false, marks: [] });                       // a linked list has no index
    expect(sceneOf(frames, objs).rows[0].marks).toEqual([]);                                   // no pointers: no marks
  });
  it("the view draws the array (indices, «i» above its cell), the set and the dictionary; a variable says «int[] #1»", () => {
    const cfg = readDsTrace(trace([{ id: 1, k: "array", type: "int[]", items: ["5", "3"] }, { id: 2, k: "set", type: "HashSet<int>", items: ["4"] },
      { id: 3, k: "map", type: "Dictionary<string, int>", keys: ["\"a\""], items: ["7"] }], { pointers: [["a", "i"]] },
      main([["a", { t: "ref", id: 1 }], ["i", { t: "v", s: "1" }], ["h", { t: "ref", id: 2 }], ["d", { t: "ref", id: 3 }]])), undefined, true)!;
    render(<DsTraceView cfg={cfg} epoch={1} />);
    expect(screen.getByRole("img", { name: /^المصفوفة a \(int\[\]\): 0: 5، 1: 3، i = 1$/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^المجموعة h \(HashSet<int>\): 4$/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^القاموس d \(Dictionary<string, int>\): "a" ← 7$/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: "المتغيّرات" }).textContent).toContain("→ int[] #1");
  });
});

describe("V5 — the lab's reader", () => {
  const SOURCE = "static void Main()\n{\n    x();\n}";
  const lab = (objs: unknown[], extra: Record<string, unknown> = {}) => readLabTrace({ status: "success", stdout: "", stderr: "", ...extra,
    steps: [{ line: 1, note: "", frames: main([["s", { t: "ref", id: 1 }]]), objs, out: "" }] }, SOURCE, "");
  it("reads rich: refs and pointers reach the trace", () => {
    const r = lab([{ id: 1, k: "array", type: "int[]", items: ["1"] }, { id: 2, k: "stack", items: ["x"], refs: [3] }, { id: 3, k: "obj", type: "P", fields: [] }], { pointers: [["s", "i"]] });
    expect(r.trace!.pointers).toEqual([["s", "i"]]);
    expect(r.trace!.steps[0].objs[1]).toEqual({ id: 2, k: "stack", items: ["x"], refs: [3] });
  });
  it("clips: refs keep the length of the clipped items; a reference to a dropped object becomes a plain value; it says so", () => {
    const long = Array.from({ length: 50 }, (_, i) => String(i));
    const many = Array.from({ length: DS_LIMITS.objs + 2 }, (_, i) => ({ id: i + 10, k: "obj", type: "P", fields: [] }));
    const r = lab([{ id: 1, k: "array", type: "int[]", items: long, refs: long.map(() => null) },
      { id: 2, k: "stack", items: ["a", "b"], refs: [10, DS_LIMITS.objs + 11] }, { id: 3, k: "node", v: "n", next: null, ref: DS_LIMITS.objs + 11 },
      { id: 4, k: "map", type: "D", keys: long, items: long }, ...many]);
    expect(r.clipped).toBe(true);
    const [arr, st, node, map] = r.trace!.steps[0].objs as Record<string, unknown>[];
    expect((arr.items as string[]).length).toBe(DS_LIMITS.items);
    expect((arr.refs as unknown[]).length).toBe(DS_LIMITS.items);
    expect(st.refs).toEqual([10, null]);
    expect("ref" in node).toBe(false);
    expect([(map.keys as string[]).length, (map.items as string[]).length]).toEqual([DS_LIMITS.items, DS_LIMITS.items]);
  });
});
