// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen } from "@testing-library/react";
import ChartSelectionEditor from "../questionTypes/editors/ChartSelectionEditor";
import type { QuestionBody } from "../examTypes";
import { validateChartSelectionQuestion } from "../chartSelectionQuestion";

// Phase 21A.1 — Review Fix 6 (round-6 findings R6-A4 / R6-A5 / R6-N1, lane C C6-1 / C6-4): the key picker sees only the chart's own
// targets — its announcement never names a key entry whose cell is being retyped, and its limit is 0 when such entries fill the bound;
// the bound field shows the bound actually stored; a datum bound is clamped by series × categories; the "empty cells" wording only where
// filling the cells would make the bound valid.
vi.mock("./echartsEngine", () => ({ CHART_ENGINE_MARKER: "x", mountChartEngine: () => ({ update() {}, resize() {}, flush() {}, dispose() {}, disposed: () => false }) }));
vi.mock("./echartsAdvanced", () => ({ CHART_ADVANCED_MARKER: "y" }));
afterEach(cleanup);
const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };
function Host({ initial, onNode }: { initial: Record<string, unknown>; onNode: (n: QuestionBody) => void }) {
  const [node, setNode] = useState<QuestionBody>({ ...(initial as unknown as QuestionBody) });
  return <ChartSelectionEditor node={node} onChange={p => { const n = { ...node, ...p } as QuestionBody; onNode(n); setNode(n); }} />;
}
const q = (chart: unknown, target: string, correct: string[], mode = "single", max = 1) => ({ presentationType: "chartSelection", questionTypeVersion: 1, marks: 3, text: "س", chartSelection: { v: 1, chart, target, mode, maxSelections: max }, answer: { scoring: "allOrNothing", correct } });
type N = { chartSelection: { chart: Record<string, unknown>; target: string; maxSelections: number }; answer: { correct: string[] } };
const barOf = () => ({ version: 1, id: "b", kind: "bar", title: "هطول", description: "هطول", categories: [{ id: "c1", label: "يناير" }, { id: "c2", label: "فبراير" }, { id: "c3", label: "مارس" }], series: [{ id: "s1", label: "الهطول", values: [5, 6, 7] }] });
const twoSeries = () => ({ ...barOf(), series: [{ id: "s1", label: "الهطول", values: [5, 6, 7] }, { id: "s2", label: "التبخر", values: [1, 2, 3] }] });
const pick = (key: string) => { const b = screen.getByTestId("chart-key-picker").querySelector(`[data-xp-key="${key}"]`) as HTMLButtonElement; fireEvent.click(b); };
const announced = () => screen.getByTestId("chart-key-picker").querySelector("[aria-live]")!.textContent ?? "";
const empty = async (name: string) => { fireEvent.change(screen.getByRole("textbox", { name }), { target: { value: "" } }); await settle(); };
const boundField = () => screen.getByRole("spinbutton", { name: "أقصى عدد للاختيارات" }) as HTMLInputElement;

describe("21A1-RB43 the key picker with a cell being retyped (round-6 findings R6-A4, C6-1)", () => {
  it("the announcement names only what the click changed: «تم تحديد: فبراير», never a deselection of the retyped entry (C6-1a)", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(), "datum", ["s1/c1", "s1/c3"], "multiple", 3)} onNode={n => { box.node = n; }} />);
    await settle();
    await empty("الهطول — مارس");
    pick("s1/c2");
    await settle();
    expect((box.node as unknown as N).answer.correct).toEqual(["s1/c1", "s1/c2", "s1/c3"]);
    expect(announced()).toContain("تم تحديد: فبراير");
    expect(announced()).not.toContain("أُلغي تحديد");
    expect(announced()).not.toContain("s1/c3");
  });
  it("bound 1 filled by the retyped entry: a click adds nothing and says the limit is reached (C6-1b)", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(), "datum", ["s1/c3"], "multiple", 1)} onNode={n => { box.node = n; }} />);
    await settle();
    await empty("الهطول — مارس");
    const before = box.node;
    pick("s1/c1");
    await settle();
    expect(box.node).toBe(before);
    expect((box.node as unknown as N).answer.correct).toEqual(["s1/c3"]);
    expect(announced()).toContain("بلغت الحد الأقصى");
  });
  it("bound 2 filled by two retyped entries: a click on the third value adds nothing (R6-A4)", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(), "datum", ["s1/c2", "s1/c3"], "multiple", 2)} onNode={n => { box.node = n; }} />);
    await settle();
    await empty("الهطول — فبراير");
    await empty("الهطول — مارس");
    const before = box.node;
    pick("s1/c1");
    await settle();
    expect(box.node).toBe(before);
    expect([...(box.node as unknown as N).answer.correct].sort()).toEqual(["s1/c2", "s1/c3"]);
    expect(validateChartSelectionQuestion(box.node as never).map(i => i.code)).not.toContain("CHART_SELECTION_KEY_UNREACHABLE");
  });
  it("single mode: a click on another value replaces the retyped entry (one correct answer)", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(), "datum", ["s1/c3"])} onNode={n => { box.node = n; }} />);
    await settle();
    await empty("الهطول — مارس");
    pick("s1/c1");
    await settle();
    expect((box.node as unknown as N).answer.correct).toEqual(["s1/c1"]);
  });
});

describe("21A1-RB44 the bound field shows the bound stored (round-6 finding R6-A5); a datum bound counts series × categories (C6-4)", () => {
  it("one value cell empty, bound 2 → 3: stored 3 and shown 3; typing 5 stores and shows the 3 slots", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(), "datum", ["s1/c1"], "multiple", 2)} onNode={n => { box.node = n; }} />);
    await settle();
    await empty("الهطول — مارس");
    fireEvent.change(boundField(), { target: { value: "3" } });
    await settle();
    expect((box.node as unknown as N).chartSelection.maxSelections).toBe(3);
    expect(boundField().value).toBe("3");
    fireEvent.change(boundField(), { target: { value: "5" } });
    await settle();
    expect((box.node as unknown as N).chartSelection.maxSelections).toBe(3);
    expect(boundField().value).toBe("3");
  });
  it("two series × three categories, bound 6: emptying one cell keeps 6 (mutant X20: the categories alone would give 3 or 5)", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(twoSeries(), "datum", ["s1/c1"], "multiple", 6)} onNode={n => { box.node = n; }} />);
    await settle();
    await empty("التبخر — فبراير");
    expect((box.node as unknown as N).chartSelection.maxSelections).toBe(6);
    expect(boundField().max).toBe("6");
  });
});

describe("21A1-RB45 the bound's message (round-6 finding R6-N1; lane C C6-4)", () => {
  const holed = () => ({ ...twoSeries(), series: [{ id: "s1", label: "الهطول", values: [5, null, 7] }, { id: "s2", label: "التبخر", values: [1, 2, 3] }] });
  const maxMessage = (node: unknown) => validateChartSelectionQuestion(node as never).find(i => i.code === "CHART_SELECTION_MAX_INVALID")?.message ?? "";
  it("multiple datum choice, bound within the slots but above the filled values: «بعض خلاياه فارغة»", () => {
    expect(maxMessage(q(holed(), "datum", ["s1/c1"], "multiple", 6))).toContain("بعض خلاياه فارغة");
  });
  it("the general message where filling cannot help: a bound above every slot, single mode, a bound under 1 or not whole", () => {
    for (const node of [q(holed(), "datum", ["s1/c1"], "multiple", 7), q(holed(), "datum", ["s1/c1"], "single", 2), q(holed(), "datum", ["s1/c1"], "multiple", 0), q(holed(), "datum", ["s1/c1"], "multiple", 5.5)]) {
      const m = maxMessage(node);
      expect(m).toContain("عدد صحيح من 1");
      expect(m).not.toContain("فارغة");
    }
  });
  it("the general message for a series target, whatever its cells (mutant X23)", () => {
    expect(maxMessage(q(holed(), "series", ["s1"], "multiple", 3))).not.toContain("فارغة");
  });
  it("a valid config with an unknown key entry reports it once (mutant X24)", () => {
    expect(validateChartSelectionQuestion(q(barOf(), "datum", ["s9/c1"], "multiple", 2) as never).map(i => i.code)).toEqual(["CHART_SELECTION_KEY_UNKNOWN_TARGET"]);
  });
});
