// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import { readDsTrace, extrasOf, type DsStep, type DsFrame } from "../learning/activities/ds";
import DsTraceView from "../learning/activities/DsTraceView";
import { readLabTrace } from "./labTrace";

// Visual lab V9 (docs/enterprise-csharp-visual-lab-plan.md §18) — «أسس علم الحاسوب» in the visual run (rich traces only):
//   • the reader: a step's `evals` (the values of /, %, comparisons, &&, ||, !), a frame's `types`, a `grid` (int[,]), `digits` and
//     [array, row, column] pointers — read strictly, and ONLY in a rich trace (a course trace with any of them is unreadable: pins);
//   • what is drawn: the expressions' values under the step's note; each variable's type; a number in place-value boxes (base 10 or
//     2…), its last digit lit when this step took it (n % base); a string indexed by s[i] as cells with the i arrow; a grid with
//     the a[i, j] cell its indexes point at;
//   • the lab's reader keeps them (clipped as the drawing needs).
afterEach(cleanup);
const compact = (h: unknown[] = [], extra: Record<string, unknown> = {}, f: unknown = [{ name: "Main", vars: [] }], top: Record<string, unknown> = {}) =>
  ({ code: "a\nb\nc", out: "", steps: [{ l: 1, n: "", f, h, o: 0, ...extra }], ...top });

describe("V9 — the reader", () => {
  it("rich: evals, types, a grid, digits and an [array, row, column] pointer are read", () => {
    const t = readDsTrace(compact([{ id: 1, k: "grid", type: "int[,]", rows: [["1", "2"], ["3", "4"]] }], { x: [["n % 10", "4"]] },
      [{ name: "Main", vars: [["n", { t: "v", s: "12" }]], types: ["int"] }], { pointers: [["g", "i", "j"], ["s", "i"]], digits: [["n", 10]] }), undefined, true)!;
    expect(t.steps[0].evals).toEqual([["n % 10", "4"]]);
    expect(t.steps[0].frames[0].types).toEqual(["int"]);
    expect(t.steps[0].objs[0]).toEqual({ id: 1, k: "grid", type: "int[,]", rows: [["1", "2"], ["3", "4"]] });
    expect(t.pointers).toEqual([["g", "i", "j"], ["s", "i"]]);
    expect(t.digits).toEqual([["n", 10]]);
  });
  it("pin: without rich (every course trace) any of them makes the trace unreadable", () => {
    expect(readDsTrace(compact([], { x: [["a", "b"]] }))).toBeNull();
    expect(readDsTrace(compact([], {}, [{ name: "Main", vars: [], types: [] }]))).toBeNull();
    expect(readDsTrace(compact([{ id: 1, k: "grid", type: "int[,]", rows: [] }]))).toBeNull();
    expect(readDsTrace(compact([], {}, undefined, { digits: [["n", 10]] }))).toBeNull();
    expect(readDsTrace(compact())).not.toBeNull();
  });
  it("strict: types not aligned with the variables, a bad base, too many evals, a pointer of 4 → unreadable", () => {
    const rich = (...a: Parameters<typeof compact>) => readDsTrace(compact(...a), undefined, true);
    expect(rich([], {}, [{ name: "Main", vars: [["n", { t: "v", s: "1" }]], types: [] }])).toBeNull();
    expect(rich([], {}, undefined, { digits: [["n", 3]] })).toBeNull();
    expect(rich([], { x: Array.from({ length: 13 }, () => ["a", "b"]) })).toBeNull();
    expect(rich([], {}, undefined, { pointers: [["a", "b", "c", "d"]] })).toBeNull();
    expect(rich([{ id: 1, k: "grid", type: "int[,]", rows: Array.from({ length: 21 }, () => ["0"]) }])).toBeNull();
  });
  it("the lab's reader keeps evals, types, grids and digits", () => {
    const r = readLabTrace({ status: "success", stdout: "", stderr: "", pointers: [["g", "i", "j"]], digits: [["n", 2]], steps: [{ line: 1, note: "",
      frames: [{ name: "Main", vars: [["n", { t: "v", s: "5" }]], types: ["int"] }], objs: [{ id: 3, k: "grid", type: "int[,]", rows: [["0"]] }], out: "", evals: [["n % 2", "1"]] }] }, "a", "");
    expect(r.trace!.steps[0]).toMatchObject({ evals: [["n % 2", "1"]], frames: [{ types: ["int"] }], objs: [{ k: "grid", rows: [["0"]] }] });
    expect(r.trace!.digits).toEqual([["n", 2]]);
  });
});

const step = (vars: DsFrame["vars"], objs: DsStep["objs"] = [], evals?: [string, string][]): DsStep =>
  ({ line: 1, note: "", frames: [{ name: "Main", vars }], objs, out: "", error: false, ...(evals ? { evals } : {}) });

describe("V9 — what is drawn", () => {
  it("a number in its place values (base 10 and base 2); its last digit lit when this step took it", () => {
    const s = step([["n", { t: "v", s: "1234" }], ["b", { t: "v", s: "6" }]], [], [["n % 10", "4"]]);
    const { places } = extrasOf(s, undefined, [["n", 10], ["b", 2]]);
    expect(places).toEqual([{ name: "n", base: 10, value: "1234", digits: ["1", "2", "3", "4"], hot: true }, { name: "b", base: 2, value: "6", digits: ["1", "1", "0"], hot: false }]);
  });
  it("a string indexed by s[i]: its characters, the arrow at i; a grid: the [i, j] cell", () => {
    const s = step([["s", { t: "v", s: "\"abc\"" }], ["i", { t: "v", s: "1" }], ["g", { t: "ref", id: 4 }], ["r", { t: "v", s: "1" }], ["c", { t: "v", s: "0" }]],
      [{ id: 4, k: "grid", type: "int[,]", rows: [["1", "2"], ["3", "4"]] }]);
    const { texts, grids } = extrasOf(s, [["s", "i"], ["g", "r", "c"]]);
    expect(texts).toEqual([{ name: "s", chars: ["a", "b", "c"], marks: [{ name: "i", at: 1, top: true }] }]);
    expect(grids[0]).toMatchObject({ labels: ["g"], mark: { r: 1, c: 0, names: "r, c" } });
    expect(extrasOf(step([["g", { t: "ref", id: 4 }], ["r", { t: "v", s: "5" }], ["c", { t: "v", s: "0" }]], s.objs), [["g", "r", "c"]]).grids[0].mark).toBeNull();   // out of range
  });
  it("the view: the expressions' values, each variable's type, and the drawings", () => {
    const cfg = readDsTrace(compact([{ id: 4, k: "grid", type: "int[,]", rows: [["1", "2"], ["3", "4"]] }], { x: [["n % 10", "4"], ["n > 0", "true"]] },
      [{ name: "Main", vars: [["n", { t: "v", s: "1234" }], ["s", { t: "v", s: "\"ab\"" }], ["i", { t: "v", s: "0" }], ["g", { t: "ref", id: 4 }]], types: ["int", "string", "int", "int[,]"] }],
      { pointers: [["s", "i"], ["g", "i", "i"]], digits: [["n", 10]] }), undefined, true)!;
    render(<DsTraceView cfg={cfg} epoch={1} />);
    const evals = screen.getByRole("region", { name: "قيم التعابير في هذه الخطوة" });
    expect(evals.textContent).toContain("n % 10 → 4");
    expect(evals.textContent).toContain("n > 0 → true");
    expect(within(screen.getByRole("region", { name: "المتغيّرات" })).getAllByText("int").length).toBe(2);
    expect(screen.getByRole("img", { name: /^منازل n = 1234 في الأساس 10: 1 × 1000 \+ 2 × 100 \+ 3 × 10 \+ 4 × 1؛ أُخذ الآن الرقم الأخير 4$/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^النص s \(string\): 0: a، 1: b، i = 0$/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^المصفوفة الثنائية g \(int\[,\]\): الصف 0: 1، 2؛ الصف 1: 3، 4؛ \[i, i\] = \[0, 0\]$/ })).toBeTruthy();
  });
  it("pin: a course trace draws none of it", () => {
    const cfg = readDsTrace(compact([], {}, [{ name: "Main", vars: [["n", { t: "v", s: "12" }]] }]))!;
    render(<DsTraceView cfg={cfg} epoch={1} />);
    expect(screen.queryByRole("region", { name: "قيم التعابير في هذه الخطوة" })).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
