// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import ChartSelectionEditor from "../questionTypes/editors/ChartSelectionEditor";
import type { QuestionBody } from "../examTypes";
import { convertChartKind } from "./chartEditing";
import { validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import { rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 2 (authoring): a kind change that keeps every value but clears the answer key asks first (N-3); the selection
// bound shows the value actually stored once it is clamped (N-8).
vi.mock("./echartsEngine", () => ({ CHART_ENGINE_MARKER: "x", mountChartEngine: () => ({ update() {}, resize() {}, flush() {}, dispose() {}, disposed: () => false }) }));
vi.mock("./echartsAdvanced", () => ({ CHART_ADVANCED_MARKER: "y" }));
afterEach(cleanup);
const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };
type Node = { chartSelection: { chart: ChartSpecV1; target: string; maxSelections: number }; answer: { correct: string[] } };

function SelectionHost({ initial, onNode }: { initial: Record<string, unknown>; onNode: (n: QuestionBody) => void }) {
  const [node, setNode] = useState<QuestionBody>({ ...(initial as unknown as QuestionBody) });
  return <ChartSelectionEditor node={node} onChange={p => { const n = { ...node, ...p } as QuestionBody; onNode(n); setNode(n); }} />;
}
// five months, one series, no axis titles: bar → radar keeps every value (lossless), but a radar's only target is its series
const fiveMonths = (): ChartSpecV1 => {
  const { xAxis: _x, yAxis: _y, referenceLines: _r, ...rest } = rainfallBar() as CategoryChartSpec;
  return { ...rest, categories: rest.categories.slice(0, 5), series: [{ id: "rain", label: "الهطول", values: [1, 2, 3, 4, 5] }] } as ChartSpecV1;
};
const rainQuestion = (correct: string[] = ["may"], chart: ChartSpecV1 = rainfallBar() as ChartSpecV1) => ({ presentationType: "chartSelection", questionTypeVersion: 1, marks: 3, text: "س",
  chartSelection: { v: 1, chart, target: "category", mode: "multiple", maxSelections: 3 }, answer: { scoring: "partial", correct } });
const kindSelect = () => screen.getByRole("combobox", { name: "نوع الرسم البياني — الرسم" }) as HTMLSelectElement;
const KEY_WARNING = "ستُمسح الإجابة الصحيحة المحدَّدة";

describe("21A1-RB3b a lossless kind change that clears the answer key asks first (review fix 2, N-3)", () => {
  it("bar → radar keeps every value (lossless) but its targets are series only: the dialog names the key; cancel keeps chart and key", async () => {
    expect(convertChartKind(fiveMonths(), "radar").lossy).toBe(false);
    const box = { node: null as QuestionBody | null, calls: 0 };
    render(<SelectionHost initial={rainQuestion(["may"], fiveMonths())} onNode={n => { box.node = n; box.calls++; }} />);
    await settle();
    fireEvent.change(kindSelect(), { target: { value: "radar" } });
    await settle();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain(KEY_WARNING);
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await settle();
    expect(box.calls).toBe(0);
    expect(kindSelect().value).toBe("bar");
  });
  it("confirming applies the change and clears the key", async () => {
    const box = { node: null as QuestionBody | null };
    render(<SelectionHost initial={rainQuestion(["may"], fiveMonths())} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.change(kindSelect(), { target: { value: "radar" } });
    await settle();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "تغيير النوع" }));
    await settle();
    const n = box.node as unknown as Node;
    expect(n.chartSelection.chart.kind).toBe("radar");
    expect(n.chartSelection.target).toBe("series");
    expect(n.answer.correct).toEqual([]);
  });
  it("a change that keeps the key (bar → line, bar → pie) and a change with no key set (bar → radar) apply without a dialog", async () => {
    const box = { node: null as QuestionBody | null };
    for (const to of ["line", "pie"]) {
      render(<SelectionHost initial={rainQuestion(["may"], fiveMonths())} onNode={n => { box.node = n; }} />);
      await settle();
      fireEvent.change(kindSelect(), { target: { value: to } });
      await settle();
      expect(screen.queryByRole("dialog"), to).toBeNull();
      expect((box.node as unknown as Node).chartSelection.chart.kind).toBe(to);
      expect((box.node as unknown as Node).answer.correct).toEqual(["may"]);
      cleanup();
    }
    render(<SelectionHost initial={rainQuestion([], fiveMonths())} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.change(kindSelect(), { target: { value: "radar" } });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((box.node as unknown as Node).chartSelection.chart.kind).toBe("radar");
  });
});

describe("21A1-RB3c a target-kind change never carries the key over (review fix 2, mutant RS41)", () => {
  it("a bar whose series id equals a category id: bar → radar asks first and clears the key (the category 'jan' never becomes the series 'jan')", async () => {
    const twin = { ...fiveMonths(), series: [{ id: "jan", label: "الهطول", values: [1, 2, 3, 4, 5] }] } as ChartSpecV1;
    expect(validateChartSpec(twin).ok).toBe(true);
    const box = { node: null as QuestionBody | null };
    render(<SelectionHost initial={rainQuestion(["jan"], twin)} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.change(kindSelect(), { target: { value: "radar" } });
    await settle();
    expect(screen.getByRole("dialog").textContent).toContain(KEY_WARNING);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "تغيير النوع" }));
    await settle();
    const n = box.node as unknown as Node;
    expect([n.chartSelection.chart.kind, n.chartSelection.target]).toEqual(["radar", "series"]);
    expect(n.answer.correct).toEqual([]);
  });
});

describe("21A1-RB15b the selection bound shows the stored value once clamped (review fix 2, N-8)", () => {
  it("typing 20 for a chart with 12 selectable months stores 12 and shows 12", async () => {
    const box = { node: null as QuestionBody | null };
    render(<SelectionHost initial={rainQuestion()} onNode={n => { box.node = n; }} />);
    await settle();
    const max = screen.getByRole("spinbutton", { name: "أقصى عدد للاختيارات" }) as HTMLInputElement;
    fireEvent.change(max, { target: { value: "20" } });
    expect((box.node as unknown as Node).chartSelection.maxSelections).toBe(12);
    expect(max.value).toBe("12");
  });
});
