// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import ChartSelectionResponse from "./student/ChartSelectionResponse";
import ChartSelectionEditor from "./editors/ChartSelectionEditor";
import ChartSelectionReview from "../charts/ChartSelectionReview";
import CompositeReviewView from "../composite/CompositeReviewView";
import { resolveStudentRenderer } from "./studentRegistry";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { validateChartSelectionQuestion } from "../chartSelectionQuestion";
import type { Answer } from "../answerState";
import type { Question } from "../studentQuestionTypes";
import type { QuestionBody } from "../examTypes";
import { rainfallBar } from "../charts/testing/chartFixtures";

// Phase 21A.1 — chartSelection@1 UI: the student renderer (public projection only; pointer and keyboard give the same semantic keys), the
// teacher editor (chart created and edited in typed controls, correct targets chosen ON the chart, consistent config + key), and the teacher
// review (✓ / ✗ / missed). The rendering engine is faked (the real one is exercised in the browser certification).
const engine = vi.hoisted(() => ({ emit: [] as ((e: { type: string; componentType?: string; seriesIndex?: number; dataIndex?: number }) => void)[] }));
vi.mock("../charts/echartsEngine", () => ({ CHART_ENGINE_MARKER: "x", mountChartEngine: (_el: HTMLElement, _o: unknown, on: (e: unknown) => void) => { engine.emit.push(on as never); return { update() {}, resize() {}, dispose() {}, disposed: () => false }; } }));
vi.mock("../charts/echartsAdvanced", () => ({ CHART_ADVANCED_MARKER: "y" }));
afterEach(() => { cleanup(); engine.emit.length = 0; });
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 5)); }); };
const CFG = { v: 1, chart: rainfallBar(), target: "category", mode: "multiple", maxSelections: 2, label: "اختر الشهرين الأكثر مطرًا" };
const question = (over: Record<string, unknown> = {}) => ({ id: "q1", text: "x", marks: 4, presentationType: "chartSelection", questionTypeVersion: 1, chartSelection: CFG, ...over }) as unknown as Question;

function Student({ q, onAnswer }: { q: Question; onAnswer?: (a: Answer) => void }) {
  const [a, setA] = useState<Answer | undefined>(undefined);
  return <ChartSelectionResponse q={q} id="q1" answer={a} labelPrefix="" onAnswer={n => { setA(n); onAnswer?.(n); }} />;
}

describe("21A1-UI1 student renderer", () => {
  it("is registered lazily for chartSelection@1 only; the editor too", () => {
    expect(resolveStudentRenderer("chartSelection", 1)?.key).toBe("chartSelection");
    expect(resolveStudentRenderer("chartSelection", 2)).toBeUndefined();
    expect(resolveAuthoringEditor("chartSelection", 1)).toBeTruthy();
  });
  it("keyboard list and pointer emit the SAME semantic answer on the question's chart, bounded by maxSelections", async () => {
    const answers: Answer[] = [];
    render(<Student q={question()} onAnswer={a => answers.push(a)} />);
    await settle();
    const group = screen.getByRole("group", { name: /اختر الشهرين الأكثر مطرًا/ });
    fireEvent.click(within(group).getByRole("button", { name: "أكتوبر" }));
    act(() => engine.emit[0]({ type: "click", componentType: "series", seriesIndex: 0, dataIndex: 0 }));
    expect(answers[answers.length - 1]).toEqual({ kind: "chartSelection", chartId: "rainfall-2020", targets: ["jan", "oct"] });
    fireEvent.click(within(group).getByRole("button", { name: "فبراير" }));                         // the bound (2) is never exceeded
    expect(answers[answers.length - 1]).toEqual({ kind: "chartSelection", chartId: "rainfall-2020", targets: ["jan", "oct"] });
  });
  it("an invalid / smuggled config renders an unavailable note and never a chart (fail closed)", () => {
    render(<Student q={question({ chartSelection: { ...CFG, correct: ["oct"] } })} />);
    expect(screen.getByTestId("chart-unavailable")).toBeTruthy();
    expect(document.querySelector("figure.xp-chart")).toBeNull();
  });
  it("an answer stored for another chart is not shown as selected", async () => {
    render(<ChartSelectionResponse q={question()} id="q1" labelPrefix="" onAnswer={() => {}} answer={{ kind: "chartSelection", chartId: "other", targets: ["oct"] }} />);
    await settle();
    expect(document.querySelectorAll(".xp-chart-option[aria-pressed='true']").length).toBe(0);
  });
});

describe("21A1-UI2 teacher editor", () => {
  function Host({ initial, onNode }: { initial: Record<string, unknown>; onNode: (n: QuestionBody) => void }) {
    const [node, setNode] = useState<QuestionBody>({ ...(initial as unknown as QuestionBody) });
    return <ChartSelectionEditor node={node} onChange={p => { const n = { ...node, ...p } as QuestionBody; onNode(n); setNode(n); }} />;
  }
  it("creates a chart, picks the correct target ON the chart, and yields a finalizable question", async () => {
    const box = { node: {} as QuestionBody };
    render(<Host onNode={n => { box.node = n; }} initial={{ presentationType: "chartSelection", questionTypeVersion: 1, chartSelection: { v: 1, target: "category", mode: "single", maxSelections: 1 } as never, answer: { scoring: "allOrNothing", correct: [] } as never }} />);
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الرسم البياني" }));
    await settle();
    const picker = screen.getByTestId("chart-key-picker");
    fireEvent.click(within(picker).getByRole("button", { name: "الفئة 2" }));
    expect((box.node as unknown as { answer: unknown }).answer).toEqual({ scoring: "allOrNothing", correct: ["c2"] });
    expect(validateChartSelectionQuestion(box.node as unknown as Record<string, unknown>)).toEqual([]);
    expect(document.body.textContent).not.toMatch(/echarts|formatter|JSON/i);
  });
  it("removing the selected category prunes the key; switching to range keeps only a contiguous run; single forces allOrNothing", async () => {
    const box = { node: {} as QuestionBody };
    render(<Host onNode={n => { box.node = n; }} initial={{ presentationType: "chartSelection", questionTypeVersion: 1, chartSelection: { ...CFG, maxSelections: 3 } as never, answer: { scoring: "partial", correct: ["jan", "oct"] } as never }} />);
    await settle();
    fireEvent.change(screen.getByRole("combobox", { name: "طريقة الاختيار" }), { target: { value: "range" } });
    expect((box.node as unknown as { answer: { correct: string[] } }).answer.correct).toEqual([]);   // jan + oct is not a run
    fireEvent.change(screen.getByRole("combobox", { name: "طريقة الاختيار" }), { target: { value: "single" } });
    const n = box.node as unknown as { chartSelection: { maxSelections: number }; answer: { scoring: string } };
    expect([n.chartSelection.maxSelections, n.answer.scoring]).toEqual([1, "allOrNothing"]);
  });
});

describe("21A1-UI3 teacher review", () => {
  it("marks ✓ / ✗ / missed on the chart's own list and summarises; a broken authority says manual review", async () => {
    render(<ChartSelectionReview config={CFG} answerKey={{ scoring: "partial", correct: ["jan", "oct"] }} answer={{ kind: "chartSelection", chartId: "rainfall-2020", targets: ["oct", "feb"] }} />);
    await settle();
    expect(screen.getByRole("button", { name: /أكتوبر/ }).textContent).toBe("أكتوبر — ✓ صحيح");
    expect(screen.getByRole("button", { name: /فبراير/ }).textContent).toBe("فبراير — ✗ غير صحيح");
    expect(screen.getByRole("button", { name: /يناير/ }).textContent).toBe("يناير — ○ لم يُحدَّد");
    expect(screen.getByTestId("chart-review-summary").textContent).toContain("1 من 2 صحيحة");
    cleanup();
    render(<ChartSelectionReview config={{ ...CFG, v: 9 }} answerKey={{}} answer={undefined} />);
    expect(screen.getByTestId("chart-review-unavailable")).toBeTruthy();
  });
  it("a composite chartSelection CHILD is reviewed on its chart too (the same lazy review, marks and summary), never as raw JSON", async () => {
    type P = { id: string; label: string; type: string; marks: number; text: string; contextId: string; answer: unknown };
    const exam = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "docs/fixtures/data-charts-21a1/ExamBank_21A1_Interactive_Charts_Mini_Acceptance.json"), "utf8"));
    const d1 = exam.sections[3].questions[0], g = d1.composite.groups[0];
    const grade = (p: P) => ({ partId: p.id, groupId: g.id, label: p.label, type: p.type, score: p.id === "p1" ? 0 : 3, maxMarks: 3, countedMaxMarks: 3, correct: p.id !== "p1", manualReview: false, ignored: false, counted: true });
    const parts = (g.parts as P[]).map(p => ({ partId: p.id, groupId: g.id, childKey: "d1::part::" + p.id, label: p.label, type: p.type, questionTypeVersion: 1, marks: p.marks, text: p.text, contextId: p.contextId,
      node: { ...p, presentationType: p.type }, studentAnswer: p.id === "p1" ? { kind: "chartSelection", chartId: "sales-combo", targets: ["q2"] } : { kind: "numeric", value: "120" },
      expectedAnswer: p.answer, autoGrade: grade(p), manualScore: null, teacherComment: "" }));
    const ctx = d1.composite.contexts[0];
    const question = { questionId: "d1", questionNumber: 10, text: d1.text, marks: 6, type: "composite", studentAnswer: null, expectedAnswer: null, manualScore: null, teacherComment: "", composite: d1.composite,
      autoGrade: { questionId: "d1", score: 3, maxMarks: 6, manualReview: false, parts: (g.parts as P[]).map(grade), composite: { v: 1, groups: [{ id: g.id, gradingPolicy: "all", maxMarks: 6, partIds: ["p1", "p2"] }] } },
      compositeReview: { valid: true, contexts: [{ id: ctx.id, kind: "source", title: ctx.title, sources: ctx.sources }], parts } };
    render(<CompositeReviewView question={question as never} overrides={{}} onOverride={() => {}} />);
    await settle();
    const child = document.querySelector('[data-child-key="d1::part::p1"]') as HTMLElement;
    expect(within(child).getByTestId("chart-review-summary").textContent).toContain("0 من 1 صحيحة");
    expect(within(child).getByRole("button", { name: /الربع 2/ }).textContent).toBe("الربع 2 — ✗ غير صحيح");
    expect(within(child).getByRole("button", { name: /الربع 4/ }).textContent).toBe("الربع 4 — ○ لم يُحدَّد");
    expect(child.textContent).not.toMatch(/"targets"|"correct"/);
  });
  it("the review is a lazy, recovery-wrapped view of the assignment review (never in a student path)", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "AssignmentReview.tsx"), "utf8");
    expect(src).toMatch(/const ChartSelectionReview=lazy\(lazyWithRetry\(\(\)=>import\("\.\/charts\/ChartSelectionReview"\),"teacher-chart-review"\)\)/);
    const student = fs.readFileSync(path.join(__dirname, "student", "ChartSelectionResponse.tsx"), "utf8");
    expect(student).not.toMatch(/ChartSelectionReview|evaluateChartSelection|answer\.correct/);
  });
});
