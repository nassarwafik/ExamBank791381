// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { readDsTrace, type DsObj, type DsStep, type DsTrace, type DsVal } from "../learning/activities/ds";
import DsTraceView from "../learning/activities/DsTraceView";
import LabTraceView from "./LabTraceView";
import { readLabTrace } from "./labTrace";
import { objectGraphOf } from "./objectGraph";
import { resetDeviceLabForTests, DESKTOP_QUERY } from "./deviceCSharpLab";

// Visual lab V11 (docs/enterprise-csharp-visual-lab-plan.md §21) — structs and static fields in the visual run (rich traces only):
//   • the reader: a struct value { t: "rec", type, fields } (3 deep at most) and a step's statics (`s`: [{ name, vars }], at most 10),
//     read strictly and ONLY in a rich trace (a course trace with either is unreadable: pins); a reference inside them must exist;
//   • drawn: a struct variable as a small box of its fields (the field that changed lit); «الحقول الثابتة» per type (a change
//     marked «تغيّر»; a type whose statics first appear is not «changed»); a static field naming the structure it refers to;
//   • the object diagram: a struct inside an object is that object's rows (Pos.X, Pos.Y — no arrow); a static field or a struct's
//     field that refers to an object starts an arrow («Counter.All», «seg.Owner»).
// The recorder's side (which types' statics may be read, a static constructor never run early) is proven by tools/csharp-lab/golden.mjs.

afterEach(() => { cleanup(); resetDeviceLabForTests(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY, media: q, addEventListener() {}, removeEventListener() {} }))));

const v = (s: string) => ({ t: "v" as const, s });
const ref = (id: number) => ({ t: "ref" as const, id });
const point = (x: string, y: string): DsVal => ({ t: "rec", type: "Point", fields: [["X", v(x)], ["Y", v(y)]] });
const compact = (vars: unknown[], h: unknown[] = [], extra: Record<string, unknown> = {}) =>
  ({ code: "a\nb\nc", out: "", steps: [{ l: 1, n: "", f: [{ name: "Main", vars }], h, o: 0, ...extra }] });

describe("V11 — the reader", () => {
  it("rich: a struct value (in a variable, in an object's field, a struct inside a struct) and the step's statics are read", () => {
    const seg = { t: "rec", type: "Seg", fields: [["A", point("1", "2")], ["B", point("9", "2")]] };
    const t = readDsTrace(compact([["p", point("1", "2")], ["seg", seg]], [{ id: 1, k: "obj", type: "Shape", fields: [["Pos", point("9", "2")]] }],
      { s: [{ name: "Counter", vars: [["Made", v("1")], ["All", ref(1)]] }] }), undefined, true)!;
    expect(t.steps[0].frames[0].vars[1][1]).toEqual(seg);
    expect((t.steps[0].objs[0] as Extract<DsObj, { k: "obj" }>).fields[0][1]).toEqual(point("9", "2"));
    expect(t.steps[0].statics).toEqual([{ name: "Counter", vars: [["Made", v("1")], ["All", ref(1)]] }]);
  });
  it("statics are kept from step to step when a step leaves them out (like frames)", () => {
    const t = readDsTrace({ code: "a\nb", out: "", steps: [{ l: 1, n: "", f: [{ name: "Main", vars: [] }], h: [], o: 0, s: [{ name: "P", vars: [["n", v("1")]] }] }, { l: 2, n: "", o: 0 }] }, undefined, true)!;
    expect(t.steps[1].statics).toEqual([{ name: "P", vars: [["n", v("1")]] }]);
  });
  it("pin: without rich (every course trace) a struct value or statics make the trace unreadable", () => {
    expect(readDsTrace(compact([["p", point("1", "2")]]))).toBeNull();
    expect(readDsTrace(compact([], [], { s: [] }))).toBeNull();
    expect(readDsTrace(compact([["n", v("1")]]))).not.toBeNull();
  });
  it("strict: 4 deep, more than 10 types, a reference inside a struct or a static to an object that is not there → unreadable", () => {
    const rich = (...a: Parameters<typeof compact>) => readDsTrace(compact(...a), undefined, true);
    const deep = (n: number): DsVal => (n === 0 ? v("0") : { t: "rec", type: "S", fields: [["in", deep(n - 1)]] });
    expect(rich([["d", deep(3)]])).not.toBeNull();
    expect(rich([["d", deep(4)]])).toBeNull();
    expect(rich([], [], { s: Array.from({ length: 11 }, (_, i) => ({ name: "T" + i, vars: [] })) })).toBeNull();
    expect(rich([["s", { t: "rec", type: "S", fields: [["o", ref(9)]] }]])).toBeNull();
    expect(rich([], [], { s: [{ name: "P", vars: [["o", ref(9)]] }] })).toBeNull();
  });
  it("the lab's reader keeps a struct (its texts clipped) and the statics", () => {
    const long = "x".repeat(200);
    const r = readLabTrace({ status: "success", stdout: "", stderr: "", steps: [{ line: 1, note: "", out: "",
      frames: [{ name: "Main", vars: [["p", { t: "rec", type: "Point", fields: [["Name", v(long)]] }]] }], objs: [],
      statics: [{ name: "Program", vars: [["total", v("5")]] }] }] }, "a", "");
    const p = r.trace!.steps[0].frames[0].vars[0][1] as Extract<DsVal, { t: "rec" }>;
    expect([p.type, (p.fields[0][1] as { s: string }).s.length, r.clipped]).toEqual(["Point", 80, true]);
    expect(r.trace!.steps[0].statics).toEqual([{ name: "Program", vars: [["total", v("5")]] }]);
  });
});

const step = (vars: DsStep["frames"][0]["vars"], objs: DsObj[] = [], statics?: DsStep["statics"], line = 1): DsStep =>
  ({ line, note: "", frames: [{ name: "Main", vars }], objs, out: "", error: false, ...(statics ? { statics } : {}) });
const TRACE: DsTrace = {
  lines: ["static void Main()", "{", "    Point p = new Point(1, 2);", "    Point q = p;", "    q.X = 9;", "}"],
  steps: [
    step([["p", point("1", "2")], ["q", point("1", "2")]], [], [{ name: "Program", vars: [["total", v("5")]] }], 4),
    step([["p", point("1", "2")], ["q", point("9", "2")]], [{ id: 1, k: "stack", items: ["3"] }],
      [{ name: "Program", vars: [["total", v("6")], ["s", ref(1)]] }, { name: "Counter", vars: [["Made", v("0")]] }], 5),
  ],
};

describe("V11 — drawn in the player", () => {
  it("a struct variable is a box of its fields; the field that changed (q.X) is lit, p (a copy) is not", () => {
    render(<LabTraceView trace={TRACE} epoch={1} />);
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    const vars = screen.getByRole("region", { name: "المتغيّرات" });
    const box = (name: string) => [...vars.querySelectorAll(".learning-trace-var")].find(li => li.querySelector(".learning-trace-name")?.textContent === name)!;
    expect(box("q").querySelector(".lab-rec-type")!.textContent).toBe("Point");
    expect([...box("q").querySelectorAll(".lab-rec-field")].map(f => f.textContent + (f.classList.contains("is-changed") ? "*" : ""))).toEqual(["X9*", "Y2"]);
    expect(box("q").classList.contains("is-changed")).toBe(true);
    expect(box("p").querySelectorAll(".lab-rec-field.is-changed").length).toBe(0);
    expect(box("p").classList.contains("is-changed")).toBe(false);
  });
  it("«الحقول الثابتة» per type: total 5 → 6 marked «تغيّر»; Counter's, appearing now, are not «changed»", () => {
    render(<LabTraceView trace={TRACE} epoch={1} />);
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    const blocks = [...screen.getByRole("region", { name: "المتغيّرات" }).querySelectorAll(".lab-statics")];
    expect(blocks.map(b => b.querySelector(".learning-trace-framename")!.textContent)).toEqual(["Program — الحقول الثابتة", "Counter — الحقول الثابتة"]);
    const row = (b: Element, n: string) => [...b.querySelectorAll(".learning-trace-var")].find(li => li.querySelector(".learning-trace-name")?.textContent === n)!;
    expect(within(row(blocks[0], "total") as HTMLElement).getByText("تغيّر")).toBeTruthy();
    expect(row(blocks[1], "Made").classList.contains("is-changed")).toBe(false);
  });
  it("a static field that refers to a structure names it («Program.s»)", () => {
    render(<LabTraceView trace={TRACE} epoch={1} />);
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    expect(screen.getAllByRole("img").map(e => e.getAttribute("aria-label")).some(l => /^الراصّة Program\.s: /.test(l || ""))).toBe(true);
  });
  it("pin: a course trace has neither (the course's view shows no statics block)", () => {
    render(<DsTraceView cfg={{ lines: ["a"], steps: [step([["n", v("1")]])] }} epoch={1} />);
    expect(document.querySelector(".lab-statics")).toBeNull();
    expect(document.querySelector(".lab-rec")).toBeNull();
  });
});

describe("V11 — the object diagram", () => {
  const shape = (x: string): DsObj => ({ id: 1, k: "obj", type: "Shape", fields: [["Name", v('"box"')], ["Pos", point(x, "2")]] });
  it("a struct inside an object is that object's rows (Pos.X, Pos.Y), no arrow; the sub-field that changed is lit", () => {
    const g = objectGraphOf(step([["s", ref(1)]], [shape("9")]), step([["s", ref(1)]], [shape("1")]))!;
    expect(g.nodes[0].rows.map(r => [r.key, r.text, r.ref, r.changed])).toEqual([["Name", '"box"', null, false], ["Pos.X", "9", null, true], ["Pos.Y", "2", null, false]]);
  });
  it("a static field and a struct's field that refer to an object start arrows («Counter.All», «seg.Owner»)", () => {
    const seg: DsVal = { t: "rec", type: "Seg", fields: [["Owner", ref(1)], ["Len", v("3")]] };
    const g = objectGraphOf(step([["seg", seg]], [shape("1"), { id: 2, k: "array", type: "List<Shape>", items: ["(…)"], refs: [1] }],
      [{ name: "Counter", vars: [["Made", v("1")], ["All", ref(2)]] }]))!;
    expect(g.roots).toEqual([{ name: "seg.Owner", top: true, target: 1 }, { name: "Counter.All", top: true, target: 2 }]);
    expect(g.nodes.map(n => n.id)).toEqual([1, 2]);
  });
});
