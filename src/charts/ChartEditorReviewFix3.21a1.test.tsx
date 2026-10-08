// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import ChartSelectionEditor from "../questionTypes/editors/ChartSelectionEditor";
import type { QuestionBody } from "../examTypes";
import { validateChartSelectionQuestion } from "../chartSelectionQuestion";

// Phase 21A.1 — Review Fix 3 (round-3 findings R3-A4 / B3-3): the chartSelection key never silently points at a target it did not mean —
// a target deleted while the chart is invalid leaves the key (its id, reused for a new target, never inherits it); a conversion that starts
// from starter data drops key entries whose target changed meaning, and says so; the warning is the stored outcome.
vi.mock("./echartsEngine", () => ({ CHART_ENGINE_MARKER: "x", mountChartEngine: () => ({ update() {}, resize() {}, flush() {}, dispose() {}, disposed: () => false }) }));
vi.mock("./echartsAdvanced", () => ({ CHART_ADVANCED_MARKER: "y" }));
afterEach(cleanup);
const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };
function Host({ initial, onNode }: { initial: Record<string, unknown>; onNode: (n: QuestionBody) => void }) {
  const [node, setNode] = useState<QuestionBody>({ ...(initial as unknown as QuestionBody) });
  return <ChartSelectionEditor node={node} onChange={p => { const n = { ...node, ...p } as QuestionBody; onNode(n); setNode(n); }} />;
}
const q = (chart: unknown, target: string, correct: string[], mode = "single", max = 1) => ({ presentationType: "chartSelection", questionTypeVersion: 1, marks: 3, text: "س", chartSelection: { v: 1, chart, target, mode, maxSelections: max }, answer: { scoring: "allOrNothing", correct } });
type N = { chartSelection: { chart: Record<string, unknown>; target: string }; answer: { correct: string[] } };
const kindSelect = () => screen.getByRole("combobox", { name: "نوع الرسم البياني — الرسم" }) as HTMLSelectElement;
const barOf = (title = "هطول") => ({ version: 1, id: "b", kind: "bar", title, description: "هطول", categories: [{ id: "c1", label: "يناير" }, { id: "c2", label: "فبراير" }, { id: "c3", label: "مارس" }], series: [{ id: "s1", label: "الهطول", values: [5, 6, 7] }] });

describe("21A1-RB3d a deleted target's id never carries the key to a new target (review fix 3, R3-A4)", () => {
  it("histogram: deleting the key's bin (which leaves a gap — an invalid chart) drops it; the next added bin reuses the id without the key", async () => {
    const hist = { version: 1, id: "h1", kind: "histogram", title: "درجات", description: "توزيع الدرجات", bins: [{ id: "b1", start: 0, end: 10, count: 3 }, { id: "b2", start: 10, end: 20, count: 7 }, { id: "b3", start: 20, end: 30, count: 4 }] };
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(hist, "bin", ["b2"])} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "حذف الفئة التكرارية 2" }));
    await settle();
    expect((box.node as unknown as N).answer.correct).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "+ فئة تكرارية" }));
    await settle();
    fireEvent.change(screen.getByRole("textbox", { name: "من — الفئة التكرارية 2" }), { target: { value: "10" } });
    await settle();
    const n = box.node as unknown as N;
    expect((n.chartSelection.chart.bins as { id: string }[]).map(b => b.id)).toContain("b2");             // the id was reused…
    expect(n.answer.correct).toEqual([]);                                                                // …without the key
  });
  it("bar with an emptied label (invalid): deleting the key's category drops it; a new category with the reused id does not inherit it", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(), "category", ["c2"])} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.change(screen.getByRole("textbox", { name: "اسم الفئة 1" }), { target: { value: "" } });
    await settle();
    expect((box.node as unknown as N).answer.correct).toEqual(["c2"]);                                  // an invalid edit elsewhere keeps the key
    fireEvent.click(screen.getByRole("button", { name: "حذف الفئة 2" }));
    await settle();
    expect((box.node as unknown as N).answer.correct).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "+ فئة" }));
    fireEvent.change(screen.getByRole("textbox", { name: "اسم الفئة 1" }), { target: { value: "يناير" } });
    await settle();
    expect((box.node as unknown as N).answer.correct).toEqual([]);
  });
  it("bar (target series, key s1 \"فرع القاهرة\") → scatter: the starter series reuses s1, so the key is dropped and the dialog says so", async () => {
    const bar = { version: 1, id: "b", kind: "bar", title: "مبيعات", description: "مبيعات فرعين", categories: [{ id: "c1", label: "يناير" }, { id: "c2", label: "فبراير" }], series: [{ id: "s1", label: "فرع القاهرة", values: [5, 6] }, { id: "s2", label: "فرع الإسكندرية", values: [7, 8] }] };
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(bar, "series", ["s1"])} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.change(kindSelect(), { target: { value: "scatter" } });
    await settle();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("ستُمسح الإجابة الصحيحة المحدَّدة");
    expect(dialog.textContent).toContain("لا يتّسع النوع");                                          // ONE dialog names both (lane C N5, C3-35)
    fireEvent.click(within(dialog).getByRole("button", { name: "تغيير النوع" }));
    await settle();
    const n = box.node as unknown as N;
    expect([n.chartSelection.chart.kind, n.chartSelection.target, n.answer.correct]).toEqual(["scatter", "series", []]);
    expect(validateChartSelectionQuestion(n as never).map(i => i.code)).not.toContain("CHART_SELECTION_KEY_INVALID");
  });
});

describe("21A1-RB3g a conversion from starter data keeps no key entry (review fix 3, R3-A4)", () => {
  it("scatter (series «السلسلة 1» and «فرع الإسكندرية», key both) → bar: the starter series s1 «السلسلة 1» is not the teacher's — the key is cleared and the dialog says so", async () => {
    const sc = { version: 1, id: "s", kind: "scatter", title: "مبيعات", description: "مبيعات فرعين", series: [{ id: "s1", label: "السلسلة 1", points: [{ id: "p1", x: 1, y: 2 }, { id: "p2", x: 2, y: 4 }] }, { id: "s2", label: "فرع الإسكندرية", points: [{ id: "p3", x: 1, y: 3 }] }] };
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(sc, "series", ["s1", "s2"], "multiple", 2)} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.change(kindSelect(), { target: { value: "bar" } });
    await settle();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("ستُمسح الإجابة الصحيحة المحدَّدة");
    fireEvent.click(within(dialog).getByRole("button", { name: "تغيير النوع" }));
    await settle();
    const n = box.node as unknown as N;
    expect([n.chartSelection.chart.kind, n.chartSelection.target, n.answer.correct]).toEqual(["bar", "series", []]);
  });
});

describe("21A1-RB3f a range key while the chart is invalid (mutant RT50)", () => {
  it("an edit that makes the chart invalid keeps a contiguous range key (its order is unknown, not broken)", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(), "category", ["c2", "c3"], "range", 3)} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.change(screen.getByRole("textbox", { name: "اسم الفئة 1" }), { target: { value: "" } });
    await settle();
    expect((box.node as unknown as N).answer.correct).toEqual(["c2", "c3"]);
  });
});

describe("21A1-RB3e the key-clearing warning is the stored outcome, also while the chart is invalid (review fix 3, B3-3)", () => {
  it("an empty title (invalid chart): bar → line keeps the key and asks nothing; bar → radar warns AND clears", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(""), "category", ["c1", "c2"], "multiple", 3)} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.change(kindSelect(), { target: { value: "line" } });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((box.node as unknown as N).answer.correct).toEqual(["c1", "c2"]);
    fireEvent.change(kindSelect(), { target: { value: "radar" } });
    await settle();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "تغيير النوع" }));
    await settle();
    const n = box.node as unknown as N;
    expect([n.chartSelection.chart.kind, n.chartSelection.target, n.answer.correct]).toEqual(["radar", "series", []]);
  });
  it("a conversion whose result is invalid (bar with negative values → pie: no positive sum): the dialog and the stored key agree (lane C N8)", async () => {
    const neg = { version: 1, id: "b", kind: "bar", title: "حرارة", description: "حرارة أربعة أيام", categories: ["c1", "c2", "c3", "c4"].map((id, i) => ({ id, label: "اليوم " + (i + 1) })), series: [{ id: "s1", label: "الحرارة", values: [-5, -3, -1, 0] }] };
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(neg, "category", ["c1"])} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.change(kindSelect(), { target: { value: "pie" } });
    await settle();
    const dialog = screen.queryByRole("dialog");
    const warned = !!dialog && /الإجابة الصحيحة/.test(dialog.textContent ?? "");
    if (dialog) fireEvent.click(within(dialog).getByRole("button", { name: "تغيير النوع" }));
    await settle();
    const n = box.node as unknown as N;
    expect(n.chartSelection.chart.kind).toBe("pie");
    expect(n.answer.correct).toEqual(warned ? [] : ["c1"]);              // the slice c1 "اليوم 1" is the same target: kept, and no key warning
    expect(warned).toBe(false);
  });
});

describe("21A1-RB3h a datum keeps its key entry while its cell is retyped (round-4 finding R4-A2)", () => {
  it("clearing the key's cell and typing a new value keeps the entry; while the cell is empty the question reports the key", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(), "datum", ["s1/c1", "s1/c3"], "multiple", 2)} onNode={n => { box.node = n; }} />);
    await settle();
    const cell = () => screen.getByRole("textbox", { name: "الهطول — مارس" });
    fireEvent.change(cell(), { target: { value: "" } });
    await settle();
    let n = box.node as unknown as N;
    expect(n.answer.correct).toEqual(["s1/c1", "s1/c3"]);
    expect(validateChartSelectionQuestion(n as never).map(i => i.code)).toContain("CHART_SELECTION_KEY_UNKNOWN_TARGET"); // flagged, never dropped
    fireEvent.change(cell(), { target: { value: "97" } });
    await settle();
    n = box.node as unknown as N;
    expect(n.answer.correct).toEqual(["s1/c1", "s1/c3"]);
    expect(validateChartSelectionQuestion(n as never)).toEqual([]);
  });
  it("deleting the category drops the datum entry (its slot is gone)", async () => {
    const box = { node: null as QuestionBody | null };
    render(<Host initial={q(barOf(), "datum", ["s1/c1", "s1/c3"], "multiple", 2)} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "حذف الفئة 3" }));
    await settle();
    expect((box.node as unknown as N).answer.correct).toEqual(["s1/c1"]);
  });
});
