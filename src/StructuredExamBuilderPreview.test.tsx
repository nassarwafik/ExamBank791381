// @vitest-environment happy-dom
//
// Interactive Structured Exam Builder PREVIEW tests. The preview must be a real student simulation:
// controls are enabled, answers live only in ExamPreview's local state (ephemeral — reset on unmount),
// nothing is persisted, and the exam is rendered through the SCRUBBED pipeline so no answer key leaks.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ExamPreview } from "./StructuredExamBuilder";
import { stripAnswersForPreview } from "./examBuilderState";
import type { StructuredExam } from "./examTypes";

afterEach(cleanup);

// Minimal builder-shape exam wrapper. `q` is one question; `policy`/extra let a test tune the section.
const examWith = (questions: Record<string, unknown>[], section: Record<string, unknown> = {}): StructuredExam =>
  ({ examId: "EX", title: "معاينة", status: "draft",
     sections: [{ id: "s", title: "القسم", gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question", stimuli: {}, ...section, questions }] } as unknown as StructuredExam);

const renderPreview = (exam: StructuredExam) => render(<ExamPreview exam={exam} onClose={() => {}} />);
const selects = (c: HTMLElement) => Array.from(c.querySelectorAll("select")) as HTMLSelectElement[];
const radios = (c: HTMLElement) => Array.from(c.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
const optionTexts = (s: HTMLSelectElement) => Array.from(s.options).map(o => o.textContent);

const WORD_BANK = ["FTP", "ARP", "TFTP", "DNS", "SSH", "DHCP"];
const wordBankExam = () => examWith([{
  examQuestionId: "wb", presentationType: "wordBank", text: "طابق", marks: 2,
  wordBank: WORD_BANK,
  fields: [{ id: "f1", label: "تحويل أسماء المواقع إلى IP" }, { id: "f2", label: "توزيع وإدارة عناوين IP تلقائيًا" }]
}]);

describe("ExamPreview — interactive & not disabled", () => {
  it("A: preview controls are NOT disabled", () => {
    const { container } = renderPreview(wordBankExam());
    const ss = selects(container);
    expect(ss.length).toBe(2);
    expect(ss.every(s => s.disabled === false)).toBe(true);
  });

  it("B: wordBank dropdown exposes '— اختر —' + all bank values", () => {
    const { container } = renderPreview(wordBankExam());
    const opts = optionTexts(selects(container)[0]);
    expect(opts[0]).toBe("— اختر —");
    for (const w of WORD_BANK) expect(opts).toContain(w);
  });

  it("C: two wordBank fields update INDEPENDENTLY", () => {
    const { container } = renderPreview(wordBankExam());
    const [s1, s2] = selects(container);
    fireEvent.change(s1, { target: { value: "DNS" } });
    fireEvent.change(s2, { target: { value: "DHCP" } });
    expect(s1.value).toBe("DNS");
    expect(s2.value).toBe("DHCP");
    // Changing field 1 again must not touch field 2.
    fireEvent.change(s1, { target: { value: "ARP" } });
    expect(s1.value).toBe("ARP");
    expect(s2.value).toBe("DHCP");
  });

  it("D: multiTrueFalse dropdown exposes صحيح / غير صحيح", () => {
    const { container } = renderPreview(examWith([{
      examQuestionId: "mtf", presentationType: "multiTrueFalse", text: "حدّد", marks: 2,
      fields: [{ id: "s1", statement: "عبارة 1", kind: "boolean" }, { id: "s2", statement: "عبارة 2", kind: "boolean" }]
    }]));
    const opts = optionTexts(selects(container)[0]);
    expect(opts).toEqual(["— اختر —", "صحيح", "غير صحيح"]);
  });

  it("E: multiTrueFalse rows update INDEPENDENTLY", () => {
    const { container } = renderPreview(examWith([{
      examQuestionId: "mtf", presentationType: "multiTrueFalse", text: "حدّد", marks: 2,
      fields: [{ id: "s1", statement: "عبارة 1", kind: "boolean" }, { id: "s2", statement: "عبارة 2", kind: "boolean" }]
    }]));
    const [r1, r2] = selects(container);
    fireEvent.change(r1, { target: { value: "true" } });   // صحيح
    fireEvent.change(r2, { target: { value: "false" } });  // غير صحيح
    expect(r1.value).toBe("true");
    expect(r2.value).toBe("false");
  });

  it("F & G: tableFill select cell and boolean cell both open and work", () => {
    const { container } = renderPreview(examWith([{
      examQuestionId: "tbl", presentationType: "tableFill", text: "أكمل", marks: 3,
      tableHeaders: ["A", "B", "C"], tableRows: [["x", "", ""]],
      fields: [
        { id: "sel", row: 0, column: 1, kind: "select", options: [{ text: "OSPF" }, { text: "RIP" }] },
        { id: "bool", row: 0, column: 2, kind: "boolean" }
      ]
    }]));
    const ss = selects(container);
    expect(ss).toHaveLength(2);
    const sel = ss.find(s => optionTexts(s).includes("OSPF"))!;
    const bool = ss.find(s => optionTexts(s).includes("صحيح"))!;
    expect(sel.disabled).toBe(false);
    fireEvent.change(sel, { target: { value: "OSPF" } });
    expect(sel.value).toBe("OSPF");
    fireEvent.change(bool, { target: { value: "true" } });
    expect(bool.value).toBe("true");
  });

  it("H: CLI blanks accept text (both fields, independently)", () => {
    const { container } = renderPreview(examWith([{
      examQuestionId: "cli", presentationType: "cliFill", text: "أكمل", marks: 2,
      cli: "Switch> enable\nSwitch# [[mode]]\nSwitch(config)# [[vlan]]",
      fields: [{ id: "mode" }, { id: "vlan" }]
    }]));
    const inputs = Array.from(container.querySelectorAll("input.iex-cli-input")) as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    expect(inputs.every(i => i.disabled === false)).toBe(true);
    fireEvent.change(inputs[0], { target: { value: "configure terminal" } });
    fireEvent.change(inputs[1], { target: { value: "20" } });
    expect(inputs[0].value).toBe("configure terminal");
    expect(inputs[1].value).toBe("20");
  });

  it("I: MCQ radio selection works", () => {
    const { container } = renderPreview(examWith([{
      examQuestionId: "mcq", presentationType: "multipleChoice", text: "أي بروتوكول Link-State؟", marks: 1,
      options: [{ text: "RIP" }, { text: "OSPF" }]
    }]));
    const rs = radios(container);
    expect(rs).toHaveLength(2);
    expect(rs.every(r => r.disabled === false)).toBe(true);
    fireEvent.click(rs[1]);
    expect(rs[1].checked).toBe(true);
    expect(rs[0].checked).toBe(false);
  });

  it("J: shortAnswer textarea accepts text", () => {
    const { container } = renderPreview(examWith([{
      examQuestionId: "sa", presentationType: "shortAnswer", text: "عرّف ARP", marks: 2
    }]));
    const ta = container.querySelector("textarea.iex-open") as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(ta.disabled).toBe(false);
    fireEvent.change(ta, { target: { value: "تحويل IP إلى MAC" } });
    expect(ta.value).toBe("تحويل IP إلى MAC");
  });

  it("K: compound parts (MCQ + trueFalse + shortAnswer) update INDEPENDENTLY", () => {
    const { container } = renderPreview(examWith([{
      examQuestionId: "cmp", presentationType: "compound", text: "أجب عن البنود", marks: 15,
      parts: [
        { id: "p1", type: "multipleChoice", text: "?", marks: 5, options: [{ text: "A" }, { text: "B" }] },
        { id: "p2", type: "trueFalse", text: "?", marks: 5 },
        { id: "p3", type: "shortAnswer", text: "?", marks: 5 }
      ]
    }], { gradingPolicy: "capScore", maxMarks: 15 }));
    // p1 radios (name cmp-p1) and p2 radios (name cmp-p2) are distinct groups.
    const p1 = radios(container).filter(r => r.name.endsWith("-p1"));
    const p2 = radios(container).filter(r => r.name.endsWith("-p2"));
    const ta = container.querySelector("textarea.iex-open") as HTMLTextAreaElement;
    expect(p1).toHaveLength(2);
    expect(p2).toHaveLength(2); // trueFalse renders صحيح/غير صحيح radios
    fireEvent.click(p1[0]);      // p1 = A
    fireEvent.click(p2[1]);      // p2 = غير صحيح
    fireEvent.change(ta, { target: { value: "نص حر" } });
    expect(p1[0].checked).toBe(true);
    expect(p2[1].checked).toBe(true);
    expect(ta.value).toBe("نص حر");
    // Independence: setting p2 did not clear p1, and the text part is separate.
    expect(p1[1].checked).toBe(false);
    expect(p2[0].checked).toBe(false);
  });

  it("N: firstNAnswered progress + per-question excess hint respond to preview answers", () => {
    const mcq = (id: string) => ({ examQuestionId: id, presentationType: "multipleChoice", text: id, marks: 5, options: [{ text: "A" }, { text: "B" }] });
    const { container } = renderPreview(examWith(
      [mcq("q1"), mcq("q2"), mcq("q3")],
      { gradingPolicy: "firstNAnswered", maxMarks: 10, requiredAnswers: 2, answerUnit: "question" }
    ));
    // Before answering: no excess hint.
    expect(container.textContent).not.toContain("إجابة إضافية");
    // Answer all three (first radio of each group).
    radios(container).filter(r => r.checked === false).forEach(() => {});
    const groups = new Map<string, HTMLInputElement[]>();
    radios(container).forEach(r => { const g = groups.get(r.name) || []; g.push(r); groups.set(r.name, g); });
    for (const g of groups.values()) fireEvent.click(g[0]);
    // Third answered question is excess (only first 2 counted).
    expect(container.textContent).toContain("إجابة إضافية — لن تدخل في التصحيح");
    expect(container.textContent).toContain("سيُصحَّح أول 2 فقط");
  });

  it("M: closing (unmount) then reopening resets all preview answers", () => {
    const first = renderPreview(wordBankExam());
    fireEvent.change(selects(first.container)[0], { target: { value: "DNS" } });
    expect(selects(first.container)[0].value).toBe("DNS");
    first.unmount(); // ExamPreview unmounts → local answer state is destroyed
    const second = renderPreview(wordBankExam());
    expect(selects(second.container)[0].value).toBe(""); // back to "— اختر —"
  });
});

describe("ExamPreview — security & no persistence", () => {
  it("L: stripAnswersForPreview removes question.answer, field.correct and part.answer", () => {
    const exam = examWith([
      { examQuestionId: "mcq", presentationType: "multipleChoice", text: "?", marks: 1, options: [{ text: "A", correct: true }, { text: "B" }], answer: { correctOptionIndex: 0 } },
      { examQuestionId: "wb", presentationType: "wordBank", text: "?", marks: 2, wordBank: ["A", "B"], fields: [{ id: "f1", label: "L", correct: "A" }], answer: { mode: "exactSequence", values: ["A"] } },
      { examQuestionId: "cmp", presentationType: "compound", text: "?", marks: 5, parts: [{ id: "p1", type: "multipleChoice", text: "?", marks: 5, options: [{ text: "A" }], answer: { correctOptionIndex: 0 } }] }
    ], { gradingPolicy: "capScore", maxMarks: 10 });
    const scrubbed = stripAnswersForPreview(exam);
    const json = JSON.stringify(scrubbed);
    expect(json).not.toContain("correctOptionIndex");
    expect(json).not.toContain('"correct"');
    const s0 = scrubbed.sections[0];
    expect((s0.questions[0] as { answer?: unknown }).answer).toBeUndefined();
    expect((s0.questions[1].fields![0] as { correct?: unknown }).correct).toBeUndefined();
    expect((s0.questions[2].parts![0] as { answer?: unknown }).answer).toBeUndefined();
  });

  it("L2: the scrubbed exam still renders INTERACTIVE controls (no key needed to answer)", () => {
    const exam = examWith([{
      examQuestionId: "wb", presentationType: "wordBank", text: "?", marks: 2,
      wordBank: ["A", "B"], fields: [{ id: "f1", label: "L", correct: "A" }], answer: { mode: "exactSequence", values: ["A"] }
    }]);
    const { container } = renderPreview(exam);
    const s = selects(container)[0];
    expect(s.disabled).toBe(false);
    fireEvent.change(s, { target: { value: "B" } });
    expect(s.value).toBe("B");
    // The rendered preview DOM never carries the answer key.
    expect(container.innerHTML).not.toContain("correctOptionIndex");
  });

  it("no-persistence: interacting with the preview issues no fetch / storage write", () => {
    const fetchSpy = vi.fn();
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    try {
      const { container } = renderPreview(wordBankExam());
      fireEvent.change(selects(container)[0], { target: { value: "DNS" } });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = origFetch;
      setItem.mockRestore();
    }
  });
});
