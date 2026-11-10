// 899371 P11 (docs/enterprise-899371-enrichment-plan.md §8) — the scene validator (csharpScene.ts): a scene is read into the full state of
// every step (each step's `set` applied on the previous state), and ANYTHING unexpected refuses the whole scene (null), so the renderer
// never draws half a scene or guesses. Every refusal below is one small change to a scene that is otherwise read.
import { describe, it, expect } from "vitest";
import { readSceneConfig, changed, SCENE_LIMITS } from "./csharpScene";

type Scene = { w: number; h: number; alt: string; items: Array<Record<string, unknown>>; steps: Array<Record<string, unknown>> } & Record<string, unknown>;
const base = (): Scene => ({
  w: 400, h: 200, alt: "صندوق اسمه x يأخذ 5 ثم 8.",
  items: [
    { id: "prog", kind: "code", x: 10, y: 10, lines: ["int x = 5;", "x = 8;"] },
    { id: "bx", kind: "box", x: 200, y: 40, w: 70, h: 50, label: "x", value: "", show: false },
    { id: "t", kind: "token", x: 150, y: 44, text: "8", show: false, tone: "accent" },
  ],
  steps: [
    { say: "قبل التنفيذ." },
    { say: "السطر 1: `int x = 5;`", set: { prog: { hl: 1 }, bx: { show: true, value: "5" } } },
    { say: "السطر 2.", set: { prog: { hl: 2 }, t: { show: true, x: 235, y: 65 } } },
    { say: "x يحمل 8.", set: { bx: { value: "8", tone: "ok" }, t: { show: false } } },
  ],
});
const variant = (f: (s: Scene) => void) => { const s = base(); f(s); return readSceneConfig(s); };
const items = (s: Scene) => s.items;
const steps = (s: Scene) => s.steps;

describe("899371 P11 — the scene validator", () => {
  it("reads every step's FULL state: each step changes what it names and keeps the rest", () => {
    const c = readSceneConfig(base())!;
    expect(c).not.toBeNull();
    expect([c.w, c.h, c.alt, c.says.length, c.frames.length]).toEqual([400, 200, "صندوق اسمه x يأخذ 5 ثم 8.", 4, 4]);
    const bx = (k: number) => c.frames[k].find(i => i.id === "bx")!;
    expect([bx(0).show, bx(0).value, bx(0).tone]).toEqual([false, "", "base"]);       // defaults: shown unless said, tone base
    expect([bx(1).show, bx(1).value]).toEqual([true, "5"]);
    expect([bx(2).show, bx(2).value]).toEqual([true, "5"]);                           // step 3 does not name bx: it keeps step 2
    expect([bx(3).value, bx(3).tone]).toEqual(["8", "ok"]);
    expect(c.frames[2].find(i => i.id === "t")).toMatchObject({ show: true, x: 235, y: 65 });
    expect(c.frames.map(f => f.find(i => i.id === "prog")!.hl)).toEqual([undefined, 1, 2, 2]);
  });

  it("every kind of item is read: box, cells, grid, text, arrow, code, screen, axis, token", () => {
    const c = readSceneConfig({ w: 400, h: 300, alt: "كل العناصر.", items: [
      { id: "a", kind: "box", x: 1, y: 1, w: 40, h: 30, shape: "diamond", mono: false },
      { id: "b", kind: "cells", x: 1, y: 60, values: ["1", "2"], hi: [0], bad: [1], base: 1, idx: false, label: "خانات" },
      { id: "c", kind: "grid", x: 100, y: 60, rows: [["1", "2"], ["3", "4"]], cellsHi: [[1, 1]], size: 30 },
      { id: "d", kind: "text", x: 200, y: 20, text: "نص", anchor: "left", big: true },
      { id: "e", kind: "arrow", x: 10, y: 10, x2: 80, y2: 40, label: "true", dash: true },
      { id: "f", kind: "screen", x: 200, y: 100, w: 100, h: 40, text: "A▌", label: "الشاشة" },
      { id: "g", kind: "axis", x: 10, y: 250, w: 300, min: -2, max: 2, step: 1, marks: [{ v: 1, label: "1", tone: "ok" }] },
    ], steps: [{ say: "كل العناصر." }] });
    expect(c?.frames[0].map(i => i.kind)).toEqual(["box", "cells", "grid", "text", "arrow", "screen", "axis"]);
  });

  it.each([
    ["an unknown kind", (s: Scene) => { items(s)[1].kind = "image"; }],
    ["an unknown key on an item", (s: Scene) => { items(s)[1].onclick = "x"; }],
    ["an ill-typed value", (s: Scene) => { items(s)[1].w = "70"; }],
    ["a key of another kind", (s: Scene) => { items(s)[1].lines = ["x"]; }],
    ["a duplicate id", (s: Scene) => { items(s)[2].id = "bx"; }],
    ["an id that is not a short name", (s: Scene) => { items(s)[2].id = "Bad Id"; }],
    ["a missing required key", (s: Scene) => { delete items(s)[1].w; }],
    ["a coordinate off the stage", (s: Scene) => { items(s)[1].x = 401; }],
    ["a negative coordinate", (s: Scene) => { items(s)[2].y = -1; }],
    ["a stage too large", (s: Scene) => { s.w = SCENE_LIMITS.maxW + 1; }],
    ["a string too long", (s: Scene) => { items(s)[1].label = "x".repeat(SCENE_LIMITS.text + 1); }],
    ["no description", (s: Scene) => { s.alt = "  "; }],
    ["a top-level key that is not a scene's", (s: Scene) => { s.script = "alert(1)"; }],
    ["too many steps", (s: Scene) => { s.steps = Array.from({ length: SCENE_LIMITS.steps + 1 }, () => ({ say: "خطوة." })); }],
    ["too many items", (s: Scene) => { s.items = Array.from({ length: SCENE_LIMITS.items + 1 }, (_, i) => ({ id: "t" + i, kind: "token", x: 1, y: 1, text: "1" })); }],
    ["no step", (s: Scene) => { s.steps = []; }],
    ["a step without a sentence", (s: Scene) => { steps(s)[1].say = ""; }],
    ["a sentence with an unclosed code mark", (s: Scene) => { steps(s)[1].say = "السطر 1: `int x = 5;"; }],
    ["a step key that is not a step's", (s: Scene) => { steps(s)[1].run = true; }],
    ["a step that names no item", (s: Scene) => { steps(s)[1].set = { nobody: { show: true } }; }],
    ["a step that changes an item's kind", (s: Scene) => { steps(s)[1].set = { bx: { kind: "code" } }; }],
    ["a step that changes an item's id", (s: Scene) => { steps(s)[1].set = { bx: { id: "by" } }; }],
    ["a step with an ill-typed change", (s: Scene) => { steps(s)[1].set = { bx: { show: "yes" } }; }],
    ["a step that moves an item off the stage", (s: Scene) => { steps(s)[2].set = { t: { x: 900 } }; }],
    ["a marked line the code does not have", (s: Scene) => { steps(s)[1].set = { prog: { hl: 3 } }; }],
    ["an unknown tone", (s: Scene) => { items(s)[1].tone = "red"; }],
    ["an axis without a range", (s: Scene) => { s.items = [...items(s), { id: "ax", kind: "axis", x: 1, y: 100, w: 200, min: 3, max: 3 }]; }],
    ["an axis with too many ticks", (s: Scene) => { s.items = [...items(s), { id: "ax", kind: "axis", x: 1, y: 100, w: 200, min: 0, max: 100, step: 1 }]; }],
    ["a marked cell that does not exist", (s: Scene) => { s.items = [...items(s), { id: "cl", kind: "cells", x: 1, y: 100, values: ["1", "2"], hi: [2] }]; }],
    ["a marked grid cell that does not exist", (s: Scene) => { s.items = [...items(s), { id: "gr", kind: "grid", x: 1, y: 100, rows: [["1"]], cellsHi: [[0, 1]] }]; }],
    ["not an object", (s: Scene) => { s.items = [...items(s), "<script>" as unknown as Record<string, unknown>]; }],
  ])("refuses the whole scene for %s", (_what, f) => {
    expect(readSceneConfig(base())).not.toBeNull();
    expect(variant(f)).toBeNull();
  });

  it("refuses what is not a scene at all", () => {
    for (const c of [null, undefined, 7, "scene", [], { w: 400, h: 200, alt: "x", items: [], steps: [{ say: "x" }] }]) expect(readSceneConfig(c)).toBeNull();
  });

  it("`changed` notices a new value or tone but not a move (a move is the transition itself)", () => {
    const c = readSceneConfig(base())!;
    const at = (k: number, id: string) => c.frames[k].find(i => i.id === id)!;
    expect(changed(undefined, at(0, "bx"))).toBe(false);
    expect(changed(at(0, "bx"), at(1, "bx"))).toBe(true);    // shown with 5
    expect(changed(at(1, "bx"), at(2, "bx"))).toBe(false);   // untouched
    expect(changed(at(2, "bx"), at(3, "bx"))).toBe(true);    // 8, ok
    const moved = { ...at(2, "t") }, there = { ...moved, x: 10, y: 10 };
    expect(changed(moved, there)).toBe(false);
  });
});
