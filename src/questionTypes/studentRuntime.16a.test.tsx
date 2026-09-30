// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import StudentQuestionCard from "../StudentQuestionCard";
import CompoundQuestion from "../CompoundQuestion";
import ExamPreview from "../ExamPreview";
import type { Answer } from "../answerState";
import type { Question } from "../studentQuestionTypes";
import type { StructuredExam } from "../examTypes";
import { registerQuestionTypePlugin } from "./registerQuestionTypePlugin";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

// Phase 16A — student runtime: the card resolves a REGISTERED renderer for the Wave 1 types and emits one generic onAnswer(next);
// compound parts consume the same renderers; the teacher preview renders through the same card (parity); accessibility contracts;
// the synthetic plugin renders without a central branch. Fail-first on 6468cc7 (registry absent).
const teacherExam = (): StructuredExam => ({ examId: "E", title: "e", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", stimuli: {}, questions: [
  { examQuestionId: "ms1", presentationType: "multipleSelect", questionTypeVersion: 1, text: "أي البروتوكولات في طبقة النقل؟", marks: 4, options: [{ id: "o1", text: "TCP" }, { id: "o2", text: "UDP" }, { id: "o3", text: "IP" }], answer: { correctOptionIds: ["o1", "o2"], scoring: "partialNoPenalty" } },
  { examQuestionId: "n1", presentationType: "numericResponse", questionTypeVersion: 1, text: "تسارع الجاذبية", marks: 3, numeric: { unitRequired: true }, answer: { mode: "tolerance", expected: 9.8, tolerance: 0.1, unit: "m/s²" } },
  { examQuestionId: "x1", presentationType: "matrix", questionTypeVersion: 1, text: "طبقة كل بروتوكول", marks: 6, matrix: { rows: [{ id: "r1", label: "HTTP" }, { id: "r2", label: "TCP" }], columns: [{ id: "c1", label: "Application" }, { id: "c2", label: "Transport" }] }, answer: { correctColumnByRow: { r1: "c1", r2: "c2" } } },
  { examQuestionId: "k1", presentationType: "categorization", questionTypeVersion: 1, text: "صنّف المواد", marks: 3, categorization: { categories: [{ id: "a", label: "حمض" }, { id: "b", label: "قاعدة" }], items: [{ id: "i1", label: "HCl" }, { id: "i2", label: "NaOH" }] }, answer: { correctCategoryByItem: { i1: "a", i2: "b" } } }
] }] } as unknown as StructuredExam);
const studentQuestions = (): Question[] => sanitizeExamForStudent(teacherExam()).sections[0].questions;
function Harness({ q, initial }: { q: Question; initial?: Answer }) {
  const [answer, setAnswer] = useState<Answer | undefined>(initial);
  return <><StudentQuestionCard q={q} index={0} id={String(q.examQuestionId)} answer={answer} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setAnswer} /><output data-testid="answer">{JSON.stringify(answer ?? null)}</output></>;
}
const readAnswer = () => JSON.parse(screen.getByTestId("answer").textContent || "null");

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("16A — Wave 1 student renderers through the generic onAnswer seam", () => {
  it("multipleSelect: semantic checkboxes in a labelled fieldset; toggling emits {kind:'multiChoice', optionIds} by stable id; no key in the DOM", async () => {
    const [ms] = studentQuestions();
    render(<Harness q={ms} />);
    const group = await screen.findByRole("group", { name: /أي البروتوكولات/ });
    const boxes = within(group).getAllByRole("checkbox"); expect(boxes.length).toBe(3);
    fireEvent.click(boxes[0]); fireEvent.click(boxes[2]);
    expect(readAnswer()).toEqual({ kind: "multiChoice", optionIds: ["o1", "o3"] });
    fireEvent.click(boxes[0]);
    expect(readAnswer()).toEqual({ kind: "multiChoice", optionIds: ["o3"] });
    expect(document.body.innerHTML).not.toMatch(/correctOptionIds|partialNoPenalty/);
    expect(screen.getByText("اختيار متعدد الإجابات")).toBeTruthy();
  });
  it("numericResponse: accessible numeric input (inputmode decimal) + unit field when required; emits {kind:'numeric', value, unit}", async () => {
    const [, num] = studentQuestions();
    render(<Harness q={num} />);
    const input = await screen.findByRole("textbox", { name: /القيمة/ });
    expect(input.getAttribute("inputmode")).toBe("decimal");
    fireEvent.change(input, { target: { value: "9.8" } });
    fireEvent.change(screen.getByRole("textbox", { name: /الوحدة/ }), { target: { value: "m/s²" } });
    expect(readAnswer()).toEqual({ kind: "numeric", value: "9.8", unit: "m/s²" });
    expect(document.body.innerHTML).not.toMatch(/tolerance|expected|correctOptionIds/);
  });
  it("matrix: a table with row / column headers and one radio group per row (keyboard operable); emits {kind:'fields', values:{rowId: columnId}}", async () => {
    const [, , mx] = studentQuestions();
    render(<Harness q={mx} />);
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual(expect.arrayContaining(["Application", "Transport"]));
    expect(within(table).getAllByRole("rowheader").map(h => h.textContent)).toEqual(["HTTP", "TCP"]);
    const radios = within(table).getAllByRole("radio"); expect(radios.length).toBe(4);
    expect(radios[0].getAttribute("name")).not.toBe(radios[2].getAttribute("name"));
    fireEvent.click(radios[1]); fireEvent.click(radios[2]);
    expect(readAnswer()).toEqual({ kind: "fields", values: { r1: "c2", r2: "c1" } });
    expect(radios[1].getAttribute("aria-label")).toContain("HTTP"); expect(radios[1].getAttribute("aria-label")).toContain("Transport");
  });
  it("categorization: one labelled select per item (no drag needed); emits {kind:'fields', values:{itemId: categoryId}}", async () => {
    const [, , , cat] = studentQuestions();
    render(<Harness q={cat} />);
    const selects = await screen.findAllByRole("combobox");
    expect(selects.length).toBe(2); expect(selects[0].getAttribute("aria-label")).toContain("HCl");
    fireEvent.change(selects[0], { target: { value: "a" } }); fireEvent.change(selects[1], { target: { value: "a" } });
    expect(readAnswer()).toEqual({ kind: "fields", values: { i1: "a", i2: "a" } });
    expect(document.body.innerHTML).not.toContain("correctCategoryByItem");
  });
  it("A13 — hydrated draft answers of the new kinds render as selected state (draft save → reload)", async () => {
    const [ms, num] = studentQuestions();
    render(<Harness q={ms} initial={JSON.parse(JSON.stringify({ kind: "multiChoice", optionIds: ["o2"] }))} />);
    const boxes = await screen.findAllByRole("checkbox");
    expect((boxes[1] as HTMLInputElement).checked).toBe(true); expect((boxes[0] as HTMLInputElement).checked).toBe(false);
    cleanup();
    render(<Harness q={num} initial={{ kind: "numeric", value: "9.7", unit: "m/s²" }} />);
    expect(((await screen.findByRole("textbox", { name: /القيمة/ })) as HTMLInputElement).value).toBe("9.7");
  });
  it("legacy types are untouched: an MCQ still renders radios through onChoice and never needs onAnswer", async () => {
    const onChoice = vi.fn();
    render(<StudentQuestionCard q={{ examQuestionId: "m", presentationType: "multipleChoice", text: "س", marks: 1, options: [{ text: "أ" }, { text: "ب" }] }} index={0} id="m" answer={undefined} onChoice={onChoice} onSeq={() => {}} onTable={() => {}} onText={() => {}} />);
    fireEvent.click(screen.getAllByRole("radio")[1]);
    expect(onChoice).toHaveBeenCalledWith(1);
  });
});

describe("16A A14 — compound parts consume the same registered renderers", () => {
  it("a compound with multipleSelect + numeric + matrix parts renders each part through the registry and bubbles {kind:'compound', parts}", async () => {
    const q = sanitizeExamForStudent({ sections: [{ id: "s", questions: [{ examQuestionId: "c1", presentationType: "compound", text: "مركّب", marks: 9, parts: [
      { id: "p1", type: "multipleSelect", text: "اختر", marks: 3, options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], answer: { correctOptionIds: ["a"], scoring: "allOrNothing" } },
      { id: "p2", type: "numericResponse", text: "احسب", marks: 3, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 5, tolerance: 0 } },
      { id: "p3", type: "matrix", text: "صنّف", marks: 3, matrix: { rows: [{ id: "r1", label: "x" }], columns: [{ id: "c1", label: "1" }, { id: "c2", label: "2" }] }, answer: { correctColumnByRow: { r1: "c1" } } }
    ] }] }] }).sections[0].questions[0];
    const onPart = vi.fn();
    render(<CompoundQuestion q={q} index={0} id="c1" answer={undefined} onPart={onPart} />);
    const boxes = await screen.findAllByRole("checkbox"); fireEvent.click(boxes[1]);
    expect(onPart).toHaveBeenCalledWith("p1", { kind: "multiChoice", optionIds: ["b"] });
    fireEvent.change(await screen.findByRole("textbox", { name: /القيمة/ }), { target: { value: "5" } });
    expect(onPart).toHaveBeenCalledWith("p2", { kind: "numeric", value: "5" });
    fireEvent.click((await screen.findAllByRole("radio"))[1]);
    expect(onPart).toHaveBeenCalledWith("p3", { kind: "fields", values: { r1: "c2" } });
    expect(document.body.innerHTML).not.toMatch(/correctOptionIds|expected|correctColumnByRow/);
  });
});

describe("16A §26 — preview parity: the teacher preview renders the SAME student card", () => {
  it("ExamPreview shows the multipleSelect checkboxes and matrix table and keeps temporary answers", async () => {
    render(<ExamPreview exam={teacherExam()} onClose={() => {}} />);
    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(boxes[0]);
    expect((boxes[0] as HTMLInputElement).checked).toBe(true);
    expect((await screen.findAllByRole("table")).length).toBeGreaterThanOrEqual(1);
    expect(document.body.innerHTML).not.toMatch(/correctOptionIds|correctColumnByRow|"expected"/);
  });
});

describe("16A A3 — synthetic interactive plugin renders as a student question and a compound part", () => {
  it("its state is an ordinary Answer emitted through onAnswer / onPart", async () => {
    const unregister = registerQuestionTypePlugin({
      definition: { key: "syntheticInteractive", version: 1, label: "محاكاة تجريبية", description: "", category: "interactive", gradingMode: "auto", capabilities: { autoGrading: true, manualGrading: false, hybridGrading: false, partialCredit: true, compoundPart: true, interactive: true, requiresImage: false, offline: false }, responseKinds: ["fields"], legacy: false, icon: "⚙" },
      versions: { 1: {
        Editor: () => <div />,
        StudentRenderer: ({ answer, onAnswer }) => <button type="button" data-testid="sim-toggle" onClick={() => onAnswer({ kind: "fields", values: { l1: "up" } })}>{answer?.kind === "fields" ? "up" : "down"}</button>
      } }
    });
    try {
      render(<Harness q={{ examQuestionId: "sim", presentationType: "syntheticInteractive", questionTypeVersion: 1, text: "شغّل", marks: 4 } as Question} />);
      fireEvent.click(await screen.findByTestId("sim-toggle"));
      expect(readAnswer()).toEqual({ kind: "fields", values: { l1: "up" } });
      cleanup();
      const onPart = vi.fn();
      render(<CompoundQuestion q={{ examQuestionId: "c", presentationType: "compound", text: "c", marks: 4, parts: [{ id: "p1", type: "syntheticInteractive", text: "t" }] } as Question} index={0} id="c" answer={undefined} onPart={onPart} />);
      fireEvent.click(await screen.findByTestId("sim-toggle"));
      expect(onPart).toHaveBeenCalledWith("p1", { kind: "fields", values: { l1: "up" } });
    } finally { unregister(); }
  });
});
