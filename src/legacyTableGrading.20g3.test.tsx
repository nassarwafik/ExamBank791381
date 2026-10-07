// @vitest-environment happy-dom
// Phase 20G.3 — L-F2 through the REAL student path. The question is rendered by StudentQuestionCard, the control the card draws is asserted and
// operated, the Answer is built exactly as StudentExamPage.setTable builds it (a copy of the previous values with one index set — sparse), and
// that Answer is graded by the real server grader. Then the renderer-mode matrix: every top-level legacy table row control the card draws
// (select / checkbox / text) must be the control the shared table authority (legacyTableSemantics) reports, which the grader consumes.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { createRequire } from "node:module";
import StudentQuestionCard, { type Question, type Answer } from "./StudentQuestionCard";

const require_ = createRequire(import.meta.url);
const { gradeQuestion } = require_("../api/src/lib/assignment-grading.js");

afterEach(() => cleanup());

const STEM = "من الجدول، ما قناع الشبكة؟\n| الجهاز | IP |\n|---|---|\n| PC1 | 10.0.0.5 |\n| PC2 | 10.0.0.6 |";
const LF2 = { examQuestionId: "lf2", presentationType: "shortAnswer", text: STEM, marks: 4, answer: { text: "255.255.255.0" } };
const CB = { examQuestionId: "cb", presentationType: "tableFill", text: "وضع علامة ✓ أمام العناوين الخاصة\n| العنوان | خاص |\n|---|---|\n| 10.0.0.1 | |\n| 8.8.8.8 | |\n| 192.168.1.10 | |", marks: 6, answer: { text: "10.0.0.1، 192.168.1.10" } };
const OPTS = [{ text: "تطبيقات" }, { text: "شبكة" }, { text: "ربط" }];
const MT = { examQuestionId: "mt", presentationType: "matching", text: "| البروتوكول | الطبقة |\n| --- | --- |\n| HTTP |  |\n| IP |  |\n| Ethernet |  |", marks: 6,
  fields: [{ id: "m0", label: "HTTP", kind: "select", options: OPTS }, { id: "m1", label: "IP", kind: "select", options: OPTS }, { id: "m2", label: "Ethernet", kind: "select", options: OPTS }],
  answer: { text: "HTTP=تطبيقات;IP=شبكة;Ethernet=ربط" } };

// the student projection never carries the answer key: render what the student sees
const studentView = (q: Record<string, unknown>) => ({ ...q, answer: {} }) as unknown as Question;
// mount the card with StudentExamPage's own setTable semantics and hand back the live answer
function mount(q: Record<string, unknown>) {
  let answer: Answer | undefined;
  const onTable = (index: number, value: string | boolean) => { const prev = answer && answer.kind === "table" ? answer.values : []; const values = [...prev]; values[index] = value; answer = { kind: "table", values }; };
  const noop = () => {};
  const view = render(<StudentQuestionCard q={studentView(q)} index={0} id={String(q.examQuestionId)} answer={undefined} onChoice={noop} onSeq={noop} onTable={onTable} onText={noop} onField={noop} />);
  return { container: view.container, answer: () => JSON.parse(JSON.stringify(answer ?? null)) as Answer | null };
}
const cells = (c: HTMLElement) => ({ text: c.querySelectorAll("table input.iex-cell").length, check: c.querySelectorAll("table input.iex-check").length, select: c.querySelectorAll("table select").length });

describe("20G.3 L-F2 through the real StudentQuestionCard", () => {
  it("R1 the L-F2 question renders TEXT inputs; a student who types anything into one cell is NOT auto-credited (baseline: 4/4)", () => {
    const m = mount(LF2);
    expect(cells(m.container)).toEqual({ text: 2, check: 0, select: 0 });
    fireEvent.change(m.container.querySelector("table input.iex-cell")!, { target: { value: "لا أعرف" } });
    const answer = m.answer();
    expect(answer).toEqual({ kind: "table", values: ["لا أعرف"] });                                  // the sparse array the UI sends
    const g = gradeQuestion(LF2, answer);
    expect([g.score, g.correct, g.manualReview]).toEqual([0, false, true]);
  });
  it("R2 the check-box question renders CHECKBOXES; ticking only the first row is graded out of every row (baseline: 6/6)", () => {
    const m = mount(CB);
    expect(cells(m.container)).toEqual({ text: 0, check: 3, select: 0 });
    fireEvent.click(m.container.querySelector("table input.iex-check")!);
    expect(m.answer()).toEqual({ kind: "table", values: [true] });
    expect(gradeQuestion(CB, m.answer())).toMatchObject({ score: 4, maxMarks: 6, manualReview: false });
    // and the correct ticks earn full marks
    const all = m.container.querySelectorAll("table input.iex-check");
    fireEvent.click(all[2]);
    expect(gradeQuestion(CB, m.answer())).toMatchObject({ score: 6, correct: true, manualReview: false });
  });
  it("R3 the matching question renders SELECTS; the keyed grade is unchanged when every row is answered, and a single answered row is not inflated (baseline: 6/6)", () => {
    const m = mount(MT);
    expect(cells(m.container)).toEqual({ text: 0, check: 0, select: 3 });
    const sel = m.container.querySelectorAll("table select");
    fireEvent.change(sel[0], { target: { value: "تطبيقات" } });
    expect(gradeQuestion(MT, m.answer())).toMatchObject({ score: 2, manualReview: false });
    fireEvent.change(sel[1], { target: { value: "شبكة" } });
    fireEvent.change(sel[2], { target: { value: "ربط" } });
    expect(gradeQuestion(MT, m.answer())).toMatchObject({ score: 6, correct: true, manualReview: false });
  });
});

describe("20G.3 renderer-mode parity: the card's per-row control IS the shared table authority's control", () => {
  const SHAPES: Record<string, Record<string, unknown>> = {
    "text cells (data table)": LF2,
    "checkbox (phrasing)": CB,
    "checkbox (✓ only)": { ...CB, text: CB.text.replace("وضع علامة ✓ أمام العناوين الخاصة", "✓") },
    "checkbox (private?)": { ...CB, text: CB.text.replace("وضع علامة ✓ أمام العناوين الخاصة", "private?") },
    "select (field options)": MT,
    "select (boolean rows)": { examQuestionId: "bs", presentationType: "tableFill", text: "صنّف\n| العبارة | الحكم |\n|---|---|\n| R1 | |\n| R2 | |", marks: 2, fields: [{ id: "f0", kind: "boolean" }, { id: "f1", kind: "boolean" }] },
    "select over checkbox phrasing": { examQuestionId: "bs2", presentationType: "tableFill", text: "وضع علامة\n| العبارة | الحكم |\n|---|---|\n| R1 | |\n| R2 | |", marks: 2, fields: [{ id: "f0", kind: "boolean" }, { id: "f1", kind: "boolean" }] },
    "select (shared word bank)": { examQuestionId: "wb", presentationType: "shortAnswer", text: "أكمل\n| أ | ب |\n|---|---|\n| R1 | |\n| R2 | |", marks: 2, fields: [{ id: "f0" }, { id: "f1" }], wordBank: ["x", "y"] },
    "mixed (one row with options, one without)": { examQuestionId: "mx", presentationType: "shortAnswer", text: "وضع علامة\n| أ | ب |\n|---|---|\n| R1 | |\n| R2 | |", marks: 2, fields: [{ id: "f0", kind: "select", options: [{ text: "a" }] }] },
    "text cells (select with no options: F-series)": { examQuestionId: "fs", presentationType: "matching", text: "أكمل\n| أ | ب |\n|---|---|\n| R1 | |", marks: 1, fields: [{ id: "f0", kind: "select", options: [] }] },
    "field-type tableFill grid (no stem table drawn)": { examQuestionId: "tg", presentationType: "tableFill", text: "| أ | ب |\n|---|---|\n| R1 | |", marks: 1, tableHeaders: ["أ", "ب"], tableRows: [["R1", ""]], fields: [{ id: "c1", correct: "x" }] },
    "non-table question": { examQuestionId: "sa", presentationType: "shortAnswer", text: "اشرح", marks: 1 },
  };
  it("for every shape, each drawn row control equals legacyTableCellControl(q, row); a shape without a drawn table has no table controls (non-vacuous)", async () => {
    const authority = "./legacyTableSemantics";                                  // resolved at run time so the reproduction above also runs on the baseline
    const { legacyTableCellControl, parseTable } = await import(/* @vite-ignore */ authority);
    const seen = new Set<string>();
    for (const [name, q] of Object.entries(SHAPES)) {
      const m = mount(q);
      // the LEGACY table's rows (headed by a row <th>); a field-type grid (QuestionField) draws its own table with no row header
      const rows = [...m.container.querySelectorAll("table tbody tr")].filter(tr => tr.firstElementChild?.matches("th[scope=row]"));
      const drawn = rows.map(tr => tr.querySelector("select") ? "select" : tr.querySelector("input.iex-check") ? "checkbox" : tr.querySelector("input.iex-cell") ? "text" : "none");
      const parsed = parseTable(String(q.text ?? ""));
      if (!rows.length) { expect(name === "field-type tableFill grid (no stem table drawn)" || !parsed, name).toBe(true); cleanup(); continue; }
      expect(drawn, name).toEqual(parsed!.rows.map((_r: string[], i: number) => legacyTableCellControl(q, i)));
      drawn.forEach(d => seen.add(d));
      cleanup();
    }
    expect([...seen].sort()).toEqual(["checkbox", "select", "text"]);
  });
});
