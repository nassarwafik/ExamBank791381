// @vitest-environment happy-dom
//
// Phase 21E.2 (C) — the shared Field frame (src/ui/Field.tsx) and the five teacher editors that adopt it on top-level questions:
// the question header (text + marks), multiple choice, matching, short answer and numeric response. Pins: a visible label
// bound to the control, help and error linked with aria-describedby, aria-invalid only while an error is shown, no red field
// before the teacher has left it (unless revealed), and — the parity block — a field is invalid exactly when the canonical
// examQuality / questionTypeValidation rule for it fires, so finalization decisions and field feedback can never disagree.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { useState } from "react";
import Field, { FieldGroup, FieldRevealContext } from "./ui/Field";
import StructuredQuestionEditor from "./StructuredQuestionEditor";
import QuestionBodyEditor from "./QuestionBodyEditor";
import NumericResponseEditor from "./questionTypes/editors/NumericResponseEditor";
import { newQuestion, buildMatchingPatch, newSection } from "./examBuilderState";
import { validateStructuredExam } from "./examQuality";
import { headerFieldIssues, multipleChoiceFieldIssues, matchingFieldIssues, numericFieldIssues } from "./teacher/questionFieldIssues";
import type { BuilderQuestion, QuestionBody, StructuredExam } from "./examTypes";

afterEach(cleanup);

const describedText = (el: Element) => (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent || "").join(" | ");
const questionProps = (q: BuilderQuestion, onChange = vi.fn()) => ({ question: q, index: 0, total: 2, sectionOptions: [{ id: "s1", title: "القسم" }], currentSectionId: "s1", groupOptions: [], onChange, onDelete: vi.fn(), onMove: vi.fn(), onDuplicate: vi.fn(), onMoveToSection: vi.fn(), onPreview: vi.fn() });

describe("Field frame contract", () => {
  it("binds a visible label, links help, and shows the error only after the field was left", () => {
    render(<Field label="العنوان" help="يظهر للطلاب" error="مطلوب">{a => <input {...a} />}</Field>);
    const input = screen.getByLabelText("العنوان");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(describedText(input)).toBe("يظهر للطلاب");
    expect(screen.queryByText("مطلوب")).toBeNull();
    fireEvent.focus(input); fireEvent.blur(input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(input)).toBe("يظهر للطلاب | مطلوب");
    expect(screen.getByText("مطلوب").className).toBe("eb-field-error");
  });
  it("shows at once when revealed by the question or when showError=always; a valid field is never invalid", () => {
    render(<FieldRevealContext.Provider value><Field label="أ" error="خطأ أ">{a => <input {...a} />}</Field></FieldRevealContext.Provider>);
    expect(screen.getByLabelText("أ").getAttribute("aria-invalid")).toBe("true");
    cleanup();
    render(<Field label="ب" error="خطأ ب" showError="always">{a => <input {...a} />}</Field>);
    expect(screen.getByLabelText("ب").getAttribute("aria-invalid")).toBe("true");
    cleanup();
    render(<Field label="ج" error="">{a => <input {...a} />}</Field>);
    const c = screen.getByLabelText("ج"); fireEvent.blur(c);
    expect(c.getAttribute("aria-invalid")).toBeNull();
    expect(c.getAttribute("aria-describedby")).toBeNull();
  });
  it("hideLabel keeps the name for assistive technology; FieldGroup is a fieldset named by its legend", () => {
    render(<FieldGroup legend="الخيارات" error="ناقص" showError="always">{g => <input type="radio" aria-label="خيار" {...g} />}</FieldGroup>);
    const group = screen.getByRole("group", { name: "الخيارات" });
    expect(describedText(group)).toBe("ناقص");
    expect(screen.getByRole("radio", { name: "خيار" }).getAttribute("aria-invalid")).toBe("true");
    cleanup();
    render(<Field label="مخفي" hideLabel>{a => <input {...a} />}</Field>);
    expect(screen.getByLabelText("مخفي")).toBeTruthy();
    expect(document.querySelector("label")!.className).toContain("eb-visually-hidden");
  });
});

// A controlled host so typing really changes the question (the editors are controlled components).
function Host({ initial, children }: { initial: BuilderQuestion; children: (q: BuilderQuestion, onChange: (p: Partial<QuestionBody>) => void) => React.ReactNode }) {
  const [q, setQ] = useState(initial);
  return <>{children(q, p => setQ(prev => ({ ...prev, ...p }) as BuilderQuestion))}</>;
}

describe("editor 1 — question header: text and marks", () => {
  it("the prompt has a visible label; empty text turns invalid after blur and clears when typed", () => {
    render(<Host initial={newQuestion("shortAnswer")}>{(q, on) => <StructuredQuestionEditor {...questionProps(q, on)} />}</Host>);
    const text = screen.getByLabelText("نص السؤال");
    expect(text.tagName).toBe("TEXTAREA");
    fireEvent.blur(text);
    expect(text.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(text)).toBe("اكتب نص السؤال؛ السؤال بلا نص لا يُعتمد.");
    fireEvent.change(text, { target: { value: "ما البروتوكول؟" } });
    expect(text.getAttribute("aria-invalid")).toBeNull();
  });
  it("marks of zero are invalid (MARKS_PROBLEM) and say what to enter", () => {
    render(<Host initial={newQuestion("shortAnswer", { text: "س" })}>{(q, on) => <StructuredQuestionEditor {...questionProps(q, on)} />}</Host>);
    const marks = screen.getByLabelText("العلامة");
    fireEvent.change(marks, { target: { value: "0" } }); fireEvent.blur(marks);
    expect(marks.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(marks)).toBe("أدخل علامة أكبر من صفر.");
    fireEvent.change(marks, { target: { value: "2" } });
    expect(marks.getAttribute("aria-invalid")).toBeNull();
  });
});

describe("editor 2 — multiple choice (top-level)", () => {
  it("the options group explains a missing correct answer; choosing one clears it", () => {
    render(<Host initial={newQuestion("multipleChoice", { options: [{ text: "TCP" }, { text: "UDP" }], answer: {} })}>{(q, on) => <QuestionBodyEditor node={q} type="multipleChoice" onChange={on} framed />}</Host>);
    const group = screen.getByRole("group", { name: "الخيارات والإجابة الصحيحة" });
    expect(describedText(group)).toBe("حدّد الإجابة الصحيحة.");
    const radios = within(group).getAllByRole("radio");
    expect(radios.every(r => r.getAttribute("aria-invalid") === "true")).toBe(true);
    expect(within(group).getByLabelText("نص الخيار 2")).toBeTruthy();
    fireEvent.click(radios[1]);
    expect(group.getAttribute("aria-describedby")).toBeNull();
    expect(within(group).getAllByRole("radio").every(r => r.getAttribute("aria-invalid") === null)).toBe(true);
  });
});

describe("editor 3 — matching (top-level)", () => {
  it("an incomplete pair marks exactly the empty side, after the teacher leaves it", () => {
    render(<Host initial={newQuestion("matching", buildMatchingPatch([{ left: "HTTP", right: "80" }, { left: "DNS", right: "" }]))}>{(q, on) => <QuestionBodyEditor node={q} type="matching" onChange={on} framed />}</Host>);
    const right2 = screen.getByLabelText("الإجابة الصحيحة للعنصر 2");
    expect(right2.getAttribute("aria-invalid")).toBeNull();
    fireEvent.blur(right2);
    expect(right2.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(right2)).toBe("اكتب الإجابة الصحيحة لهذا العنصر.");
    const left2 = screen.getByLabelText("العنصر 2"); fireEvent.blur(left2);
    expect(left2.getAttribute("aria-invalid")).toBeNull();
    fireEvent.change(right2, { target: { value: "53" } });
    expect(screen.getByLabelText("الإجابة الصحيحة للعنصر 2").getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByRole("group", { name: "أزواج المطابقة" })).toBeTruthy();
  });
});

describe("editor 4 — short answer (top-level)", () => {
  it("the model answer has a visible label and its manual-review consequence as linked help", () => {
    render(<QuestionBodyEditor node={newQuestion("shortAnswer")} type="shortAnswer" onChange={vi.fn()} framed />);
    const model = screen.getByLabelText("إجابة نموذجية (اختياري)");
    expect(describedText(model)).toBe("بدون إجابة نموذجية سيذهب هذا السؤال إلى المراجعة اليدوية للمعلم.");
    fireEvent.blur(model);
    expect(model.getAttribute("aria-invalid")).toBeNull();                     // optional: never an error
  });
});

describe("editor 5 — numeric response (top-level)", () => {
  it("a reversed range marks the upper bound with the canonical message; a missing unit marks the unit", () => {
    const node = newQuestion("numericResponse", { answer: { mode: "range", min: 10, max: 2, unit: "" }, numeric: { unitRequired: true } } as Partial<BuilderQuestion>);
    render(<NumericResponseEditor node={node} onChange={vi.fn()} framed />);
    const max = screen.getByLabelText("الحد الأعلى"); fireEvent.blur(max);
    expect(max.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(max)).toBe("الحد الأدنى للمدى أكبر من الحد الأعلى.");
    const unit = screen.getByLabelText("الوحدة"); fireEvent.blur(unit);
    expect(unit.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(unit)).toContain("الوحدة مطلوبة من الطالب دون تحديد الوحدة الصحيحة.");
    expect(screen.getByLabelText("الحد الأدنى").getAttribute("aria-invalid")).toBeNull();
  });
  it("a part (not framed) keeps the frozen markup — no Field frame inside compound / composite parts", () => {
    const { container } = render(<NumericResponseEditor node={newQuestion("numericResponse")} onChange={vi.fn()} />);
    expect(container.querySelector(".eb-field")).toBeNull();
    expect(screen.getByRole("spinbutton", { name: "القيمة المتوقعة" })).toBeTruthy();
  });
});

// ── Parity with the canonical rules: the field feedback fires exactly when the finalization validator does. ──
const examOf = (q: BuilderQuestion): StructuredExam => ({ examId: "e", title: "t", sections: [{ ...newSection({ title: "ق" }), id: "s", questions: [q] }] } as unknown as StructuredExam);
const codes = (q: BuilderQuestion) => new Set(validateStructuredExam(examOf(q)).filter(i => i.questionId === q.examQuestionId).map(i => i.code));

describe("parity — field issues ⇔ canonical issue codes", () => {
  it("header: EMPTY_TEXT ⇔ text, MARKS_PROBLEM ⇔ marks", () => {
    const texts: unknown[] = ["", "  ", "نص", undefined];
    const marks: unknown[] = [0, -1, 1, 0.5, "", "3", NaN, Infinity, undefined, null, true];
    for (const type of ["shortAnswer", "multipleChoice", "compound"] as const) for (const text of texts) for (const m of marks) {
      const q = newQuestion(type, { text: text as string, marks: m as number });
      const f = headerFieldIssues(q), c = codes(q);
      expect(!!f.text, `text ${type} ${String(text)}`).toBe(c.has("EMPTY_TEXT"));
      expect(!!f.marks, `marks ${String(m)}`).toBe(c.has("MARKS_PROBLEM"));
    }
  });
  it("multiple choice: MISSING_OPTIONS ⇔ options, MISSING_ANSWER ⇔ answer", () => {
    const optionSets = [[], [{ text: "أ" }], [{ text: "أ" }, { text: "ب" }], [{ text: "" }, { text: "" }, { text: "ج" }]];
    const answers: unknown[] = [{}, { correctOptionIndex: 0 }, { correctOptionIndex: 2 }, { correctOptionIndex: -1 }, { correctOptionIndex: "1" }, { correctOptionIndex: 1.5 }, undefined];
    for (const options of optionSets) for (const answer of answers) {
      const q = newQuestion("multipleChoice", { text: "س", options, answer: answer as never });
      const f = multipleChoiceFieldIssues(q), c = codes(q);
      expect(!!f.options).toBe(c.has("MISSING_OPTIONS"));
      expect(!!f.answer, JSON.stringify({ options, answer })).toBe(c.has("MISSING_ANSWER"));
    }
  });
  it("matching: MISSING_FIELDS ⇔ list, MATCH_INCOMPLETE_PAIR ⇔ some pair", () => {
    const sets = [[], [{ left: "a", right: "1" }], [{ left: "", right: "1" }], [{ left: "a", right: " " }, { left: "b", right: "2" }]];
    for (const pairs of sets) {
      const q = newQuestion("matching", { text: "س", ...buildMatchingPatch(pairs) });
      if (!pairs.length) q.fields = [];
      const f = matchingFieldIssues(q), c = codes(q);
      expect(!!f.list).toBe(c.has("MISSING_FIELDS"));
      expect(Object.keys(f.pairs).length > 0, JSON.stringify(pairs)).toBe(c.has("MATCH_INCOMPLETE_PAIR"));
    }
  });
  it("numeric: every NUM_* error maps onto exactly one or two editor fields", () => {
    const answers: unknown[] = [{ mode: "tolerance", expected: 1, tolerance: 0 }, { mode: "tolerance", expected: "x", tolerance: -1 }, { mode: "range", min: 1, max: 2 }, { mode: "range", min: 3, max: 2 }, { mode: "range", min: "a", max: 2 }, { mode: "odd" }];
    for (const answer of answers) for (const unitRequired of [true, false]) {
      const q = newQuestion("numericResponse", { text: "س", answer: answer as never, numeric: { unitRequired } } as Partial<BuilderQuestion>);
      const f = numericFieldIssues(q), c = [...codes(q)].filter(x => x.startsWith("NUM_"));
      expect(Object.keys(f).length > 0, JSON.stringify(answer)).toBe(c.length > 0);
      if (c.includes("NUM_RANGE_REVERSED")) expect(f.max).toBeTruthy();
      if (c.includes("NUM_UNIT_REQUIRED_WITHOUT_UNIT")) expect(f.unit).toBeTruthy();
      if (c.includes("NUM_INVALID_EXPECTED")) expect(f.expected).toBeTruthy();
    }
  });
});
