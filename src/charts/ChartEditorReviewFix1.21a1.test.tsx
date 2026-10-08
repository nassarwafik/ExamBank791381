// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import ChartEditor from "./ChartEditor";
import ChartSelectionEditor from "../questionTypes/editors/ChartSelectionEditor";
import type { QuestionBody } from "../examTypes";
import { validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import { RAINFALL_2020, histogramChart, rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 1 (authoring): the chartSelection editor asks before a kind change that loses data and offers only answerable
// kinds (B-3); a histogram's x axis has no bound fields (B-9); a numeric cell that is not a number says so in TEXT and is listed (B-14);
// the selection bound can be cleared while typing (B-15).
vi.mock("./echartsEngine", () => ({ CHART_ENGINE_MARKER: "x", mountChartEngine: () => ({ update() {}, resize() {}, dispose() {}, disposed: () => false }) }));
vi.mock("./echartsAdvanced", () => ({ CHART_ADVANCED_MARKER: "y" }));
afterEach(cleanup);
const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };

function SelectionHost({ initial, onNode }: { initial: Record<string, unknown>; onNode: (n: QuestionBody) => void }) {
  const [node, setNode] = useState<QuestionBody>({ ...(initial as unknown as QuestionBody) });
  return <ChartSelectionEditor node={node} onChange={p => { const n = { ...node, ...p } as QuestionBody; onNode(n); setNode(n); }} />;
}
const rainQuestion = () => ({ presentationType: "chartSelection", questionTypeVersion: 1, marks: 3, text: "س",
  chartSelection: { v: 1, chart: rainfallBar(), target: "category", mode: "multiple", maxSelections: 3 }, answer: { scoring: "partial", correct: ["oct"] } });
const kindSelect = () => screen.getByRole("combobox", { name: "نوع الرسم البياني — الرسم" }) as HTMLSelectElement;

describe("21A1-RB3 chartSelection editor: kind changes that lose data ask first; only answerable kinds", () => {
  it("bar → box plot opens the confirmation; cancelling keeps the chart AND the key", async () => {
    const box = { node: null as QuestionBody | null, calls: 0 };
    render(<SelectionHost initial={rainQuestion()} onNode={n => { box.node = n; box.calls++; }} />);
    await settle();
    fireEvent.change(kindSelect(), { target: { value: "boxplot" } });
    await settle();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("تغيير نوع الرسم البياني");
    expect(box.calls).toBe(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await settle();
    expect(box.calls).toBe(0);
    expect(kindSelect().value).toBe("bar");
  });
  it("confirming applies the change (the key that no longer exists is cleared then, never silently before)", async () => {
    const box = { node: null as QuestionBody | null };
    render(<SelectionHost initial={rainQuestion()} onNode={n => { box.node = n; }} />);
    await settle();
    fireEvent.change(kindSelect(), { target: { value: "boxplot" } });
    await settle();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "تغيير النوع" }));
    await settle();
    const n = box.node as unknown as { chartSelection: { chart: ChartSpecV1 }; answer: { correct: string[] } };
    expect(n.chartSelection.chart.kind).toBe("boxplot");
    expect(n.answer.correct).toEqual([]);
  });
  it("a heat map (no selectable target) is not offered", async () => {
    render(<SelectionHost initial={rainQuestion()} onNode={() => {}} />);
    await settle();
    const kinds = [...kindSelect().options].map(o => o.value);
    expect(kinds).not.toContain("heatmap");
    expect(kinds).toContain("boxplot");
  });
  it("the selection bound can be cleared while typing (no forced 1); a valid number is stored", async () => {
    const box = { node: null as QuestionBody | null };
    render(<SelectionHost initial={rainQuestion()} onNode={n => { box.node = n; }} />);
    await settle();
    const max = screen.getByRole("spinbutton", { name: "أقصى عدد للاختيارات" }) as HTMLInputElement;
    fireEvent.change(max, { target: { value: "" } });
    expect(max.value).toBe("");
    expect(box.node).toBeNull();
    fireEvent.change(max, { target: { value: "5" } });
    expect((box.node as unknown as { chartSelection: { maxSelections: number } }).chartSelection.maxSelections).toBe(5);
    fireEvent.blur(max);
    expect(max.value).toBe("5");
  });
});

function Host({ initial, onValue }: { initial: ChartSpecV1; onValue: (c: ChartSpecV1) => void }) {
  const [c, setC] = useState(initial);
  return <ChartEditor chart={c} name="الرسم" onChange={n => { onValue(n); setC(n); }} />;
}

describe("21A1-RB9 histogram x axis: label and unit, no bounds", () => {
  it("the binned axis offers label and unit fields only; the value axis keeps its bounds", () => {
    render(<Host initial={histogramChart()} onValue={() => {}} />);
    expect(screen.getByRole("textbox", { name: "وحدة المحور الأفقي" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "أدنى قيمة على المحور الأفقي" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "أعلى قيمة على المحور الأفقي" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "أدنى قيمة على المحور الرأسي" })).toBeTruthy();
  });
});

describe("21A1-RB14 a cell that is not a number says so in text and is listed", () => {
  it("the error is text next to the cell (aria-describedby) and an entry in the issue list; fixing the cell clears both", () => {
    const box = { value: rainfallBar() as ChartSpecV1 };
    render(<Host initial={rainfallBar()} onValue={v => { box.value = v; }} />);
    const may = screen.getByRole("textbox", { name: "الهطول — مايو" }) as HTMLInputElement;
    fireEvent.change(may, { target: { value: "12,5" } });
    const errId = may.getAttribute("aria-describedby")!;
    expect(errId).toBeTruthy();
    expect(document.getElementById(errId)!.textContent).toBe("ليس رقمًا — لم يُحفظ");
    expect(screen.getByRole("list", { name: "مشكلات بيانات الرسم" }).textContent).toContain("الهطول — مايو");
    expect((box.value as CategoryChartSpec).series[0].values[4]).toBe(RAINFALL_2020[4]);                // nothing typed was stored
    expect(validateChartSpec(box.value).ok).toBe(true);
    fireEvent.change(may, { target: { value: "12.5" } });
    expect(may.getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByRole("list", { name: "مشكلات بيانات الرسم" })).toBeNull();
  });
});
