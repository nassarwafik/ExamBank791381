// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen } from "@testing-library/react";
import ChartSelectionEditor from "../questionTypes/editors/ChartSelectionEditor";
import type { QuestionBody } from "../examTypes";
import { validateChartSelectionQuestion } from "../chartSelectionQuestion";

// Phase 21A.1 — Review Fix 5 (round-5 findings R5-A6 … R5-A9, C5-3): a datum key entry whose cell is being retyped survives a click in the
// key picker and a kind change that keeps its series and category; emptying any cell never lowers the bound; validation names both the
// empty cells and the key entry; deleting a datum's SERIES drops its key entry (a reused series id never inherits it).
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
const kindSelect = () => screen.getByRole("combobox", { name: "نوع الرسم البياني — الرسم" }) as HTMLSelectElement;
const pick = (key: string) => { const b = screen.getByTestId("chart-key-picker").querySelector(`[data-xp-key="${key}"]`) as HTMLButtonElement; fireEvent.click(b); };

describe("21A1-RB5a the key picker keeps a datum entry whose cell is being retyped (round-5 finding R5-A6)", () => {
  it("a click on another value adds it and keeps the retyped entry; retyping the cell then leaves both", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(), "datum", ["s1/c1", "s1/c3"], "multiple", 3)} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.change(screen.getByRole("textbox", { name: "الهطول — مارس" }), { target: { value: "" } });
    await settle();
    pick("s1/c2");
    await settle();
    expect((box.node as unknown as N).answer.correct).toEqual(["s1/c1", "s1/c2", "s1/c3"]);
    fireEvent.change(screen.getByRole("textbox", { name: "الهطول — مارس" }), { target: { value: "9" } });
    await settle();
    expect((box.node as unknown as N).answer.correct).toEqual(["s1/c1", "s1/c2", "s1/c3"]);
  });
  it("the picker's limit leaves the retyped entry its place: with a bound of 2, one more value can be chosen, not two", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(), "datum", ["s1/c3"], "multiple", 2)} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.change(screen.getByRole("textbox", { name: "الهطول — مارس" }), { target: { value: "" } });
    await settle();
    pick("s1/c1");
    await settle();
    pick("s1/c2");
    await settle();
    expect((box.node as unknown as N).answer.correct).toEqual(["s1/c1", "s1/c3"]);
  });
});

describe("21A1-RB5b retyping a cell OUTSIDE the key never lowers the bound (round-5 finding R5-A7)", () => {
  it("bound 3 on three values: emptying a non-key cell and typing it again keeps 3", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(), "datum", ["s1/c1"], "multiple", 3)} onNode={n => { box.node = n; }} />);
    await settle();
    const cell = () => screen.getByRole("textbox", { name: "الهطول — فبراير" });
    fireEvent.change(cell(), { target: { value: "" } });
    await settle();
    expect((box.node as unknown as N).chartSelection.maxSelections).toBe(3);
    fireEvent.change(cell(), { target: { value: "8" } });
    await settle();
    expect((box.node as unknown as N).chartSelection.maxSelections).toBe(3);
  });
});

describe("21A1-RB5c validation while a cell is empty names the empty cells and the key entry (round-5 finding R5-A8)", () => {
  const chart = { ...barOf(), series: [{ id: "s1", label: "الهطول", values: [5, null, 7] }] };
  it("a bound above the filled values says the cells are empty; a key entry on an empty cell is reported as no target", () => {
    const issues = validateChartSelectionQuestion(q(chart, "datum", ["s1/c2"], "multiple", 3) as never);
    expect(issues.map(i => i.code)).toEqual(expect.arrayContaining(["CHART_SELECTION_MAX_INVALID", "CHART_SELECTION_KEY_UNKNOWN_TARGET"]));
    expect(issues.find(i => i.code === "CHART_SELECTION_MAX_INVALID")!.message).toContain("بعض خلاياه فارغة");
  });
  it("without empty cells the bound's message is the general one", () => {
    const issues = validateChartSelectionQuestion(q(barOf(), "datum", ["s1/c2"], "multiple", 4) as never);
    expect(issues.find(i => i.code === "CHART_SELECTION_MAX_INVALID")!.message).not.toContain("فارغة");
  });
});

describe("21A1-RB5d a kind change keeps a retyped datum entry where both kinds hold its series and category (round-5 finding R5-A9)", () => {
  it("bar → line with the key's cell empty: no dialog, the key keeps both entries", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(), "datum", ["s1/c1", "s1/c3"], "multiple", 2)} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.change(screen.getByRole("textbox", { name: "الهطول — مارس" }), { target: { value: "" } });
    await settle();
    fireEvent.change(kindSelect(), { target: { value: "line" } });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    const n = box.node as unknown as N;
    expect(n.chartSelection.chart.kind).toBe("line");
    expect(n.answer.correct).toEqual(["s1/c1", "s1/c3"]);
  });
});

describe("21A1-RB5e deleting a datum's SERIES drops its key entry; the reused series id never inherits it (round-5 finding C5-3)", () => {
  it("two series, key s2/c1: delete series 2 → key []; add a series (id s2 again) and type its January → key still []", async () => {
    const two = { ...barOf(), categories: [{ id: "c1", label: "يناير" }, { id: "c2", label: "فبراير" }], series: [{ id: "s1", label: "الهطول", values: [5, 6] }, { id: "s2", label: "التبخر", values: [9, 4] }] };
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(two, "datum", ["s2/c1"])} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "حذف السلسلة 2" }));
    await settle();
    expect((box.node as unknown as N).answer.correct).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "+ سلسلة" }));
    await settle();
    const cells = screen.getAllByRole("textbox").filter(e => /يناير/.test(e.getAttribute("aria-label") ?? ""));
    fireEvent.change(cells[cells.length - 1], { target: { value: "3" } });
    await settle();
    const n = box.node as unknown as N;
    expect((n.chartSelection.chart.series as { id: string }[]).map(s => s.id)).toContain("s2");
    expect(n.answer.correct).toEqual([]);
  });
});
