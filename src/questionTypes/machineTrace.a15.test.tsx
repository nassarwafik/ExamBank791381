// @vitest-environment happy-dom
// AUTO-A15a — machineTrace@1 UI: the registries know the type; the student sees the machine as a TABLE (no player, no run), writes the
// run row by row in the kind's own fields — a state, a set of states, the stack with its symbol buttons, the tape and the head — and the
// verdict; a saved answer comes back; disabled is read-only. The teacher writes the machine in the book's notation and sees the student's
// table and the true run, the key staying empty; the editor's machine round-trips through the notation.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import MachineTraceResponse from "./student/MachineTraceResponse";
import MachineTraceEditor from "./editors/MachineTraceEditor";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer } from "./studentRegistry";
import { typeDescription } from "./typePresentation";
import { questionTypeDefinition } from "../questionTypeCatalog";
import { answered, type Answer } from "../answerState";
import { parseTraceNotation, formatTraceNotation } from "../automata/machineTraceNotation";
import { gradeTrace, engineOfTraceMachine, validateMachineTraceQuestion } from "../machineTraceQuestion";
import type { Question } from "../studentQuestionTypes";

afterEach(() => cleanup());
const DFA = { kind: "DFA", states: ["q0", "q1"], alphabet: ["a", "b"], start: "q0", accept: ["q1"], transitions: [["q0", "a", "q1"], ["q0", "b", "q0"], ["q1", "a", "q1"], ["q1", "b", "q0"]] };
const PDA = { kind: "PDA", states: ["q0", "q1"], alphabet: ["a", "b"], start: "q0", accept: ["q1"], transitions: [{ from: "q0", read: "a", top: "⏊", op: "push", write: "A", to: "q0" }, { from: "q0", read: "b", top: "A", op: "pop", write: "A", to: "q1" }] };
const TM = { kind: "TM", states: ["q0", "q1"], alphabet: ["a"], start: "q0", accept: ["q1"], leftEnd: "├", transitions: [{ from: "q0", read: "a", write: "A", move: "R", to: "q0" }, { from: "q0", read: "∆", write: "∆", move: "S", to: "q1" }] };
const NFA = { kind: "NFA", states: ["p", "q"], alphabet: ["a"], start: "p", accept: ["q"], transitions: [["p", "a", "p"], ["p", "a", "q"]] };
const q = (machine: object, word: string) => ({ examQuestionId: "t1", text: "تتبّع", marks: 4, presentationType: "machineTrace", questionTypeVersion: 1, machineTrace: { v: 1, machine, word } }) as unknown as Question;
function renderResponse(machine: object, word: string, answer?: Answer, disabled = false) {
  const sent: Answer[] = [];
  const r = render(<MachineTraceResponse q={q(machine, word)} id="t1" answer={answer} onAnswer={a => sent.push(a)} disabled={disabled} labelPrefix="" />);
  return { ...r, sent, last: () => sent[sent.length - 1] as unknown as { kind: string; rows: Record<string, unknown>[]; verdict: string | null } };
}

describe("A15a — the type is registered", () => {
  it("catalog, editor, renderer and description", () => {
    expect(questionTypeDefinition("machineTrace")).toMatchObject({ label: "تتبّع تشغيل آلة", category: "interactive", gradingMode: "auto" });
    expect(questionTypeDefinition("machineTrace")!.capabilities.partialCredit).toBe(true);
    expect(resolveAuthoringEditor("machineTrace", 1)).toBeTruthy();
    expect(resolveStudentRenderer("machineTrace", 1)).toBeTruthy();
    expect(typeDescription(questionTypeDefinition("machineTrace")!)).toMatch(/خطوة خطوة/);
  });
});

describe("A15a — the student", () => {
  it("a finite automaton: the δ table and the word, NO player; a state per row, rows added as copies, the verdict — the answer graded by the contract", () => {
    const { sent, last, container } = renderResponse(DFA, "ab");
    const table = screen.getByTestId("machine-trace-machine");
    expect(within(table).getByText(/جدول الانتقالات δ/)).toBeTruthy();
    expect(container.querySelector("svg, canvas, [data-testid='automaton-player']")).toBeNull();
    expect(screen.queryByRole("button", { name: /شغّل|تشغيل خطوة/ })).toBeNull();
    const row0 = () => screen.getAllByTestId("machine-trace-row");
    fireEvent.change(within(row0()[0]).getByLabelText("الحالة"), { target: { value: "q0" } });
    fireEvent.click(screen.getByRole("button", { name: /أضف خطوة/ }));
    expect((within(row0()[1]).getByLabelText("الحالة") as HTMLSelectElement).value).toBe("q0");   // a copy of the row above
    fireEvent.change(within(row0()[1]).getByLabelText("الحالة"), { target: { value: "q1" } });
    fireEvent.click(screen.getByRole("button", { name: /أضف خطوة/ }));
    fireEvent.change(within(row0()[2]).getByLabelText("الحالة"), { target: { value: "q0" } });
    fireEvent.click(screen.getByLabelText("الكلمة مرفوضة"));
    expect(last()).toEqual({ kind: "machineTrace", rows: [{ state: "q0" }, { state: "q1" }, { state: "q0" }], verdict: "reject" });
    expect(answered(sent[sent.length - 1])).toBe(true);
    expect(gradeTrace(engineOfTraceMachine(DFA)!, "ab", last() as never)).toMatchObject({ parts: 4, right: 4 });
    fireEvent.click(screen.getByRole("button", { name: "احذف آخر خطوة" }));
    expect(last().rows).toHaveLength(2);
  });

  it("a push-down automaton: the stack is built with its symbol buttons (⏊ never typed), bottom to top", () => {
    const { last } = renderResponse(PDA, "ab");
    const row = screen.getAllByTestId("machine-trace-row")[0];
    fireEvent.change(within(row).getByLabelText("الحالة"), { target: { value: "q0" } });
    fireEvent.click(within(row).getByRole("button", { name: "أضف ⏊" }));
    fireEvent.click(within(row).getByRole("button", { name: "أضف A" }));
    fireEvent.click(within(row).getByRole("button", { name: "احذف آخر رمز" }));
    expect(last().rows).toEqual([{ state: "q0", stack: "⏊" }]);
    expect(screen.getByText(/⏊ قاع المكدّس/)).toBeTruthy();
  });

  it("a Turing machine: the tape with its symbol buttons and the head chosen from its cells — stored as «├[a]»", () => {
    const { last } = renderResponse(TM, "a");
    const row = screen.getAllByTestId("machine-trace-row")[0];
    fireEvent.change(within(row).getByLabelText("الحالة"), { target: { value: "q0" } });
    fireEvent.click(within(row).getByRole("button", { name: "أضف ├" }));
    fireEvent.click(within(row).getByRole("button", { name: "أضف a" }));
    fireEvent.change(within(row).getByLabelText("موضع الرأس"), { target: { value: "1" } });
    expect(last().rows).toEqual([{ state: "q0", tape: "├[a]" }]);
    expect(gradeTrace(engineOfTraceMachine(TM)!, "a", { kind: "machineTrace", rows: [{ state: "q0", tape: "├[a]" }], verdict: null } as never)!.rows[0]).toBe(true);
  });

  it("a non-deterministic automaton: a set of states per row (checkboxes), ∅ when none", () => {
    const { last } = renderResponse(NFA, "a");
    const row = screen.getAllByTestId("machine-trace-row")[0];
    expect(within(row).getByText("∅")).toBeTruthy();
    fireEvent.click(within(row).getByRole("checkbox", { name: "p" }));
    expect(last().rows).toEqual([{ states: ["p"] }]);
  });

  it("a saved answer comes back; disabled is read-only; an unreadable question says so and touches nothing", () => {
    const saved = { kind: "machineTrace", rows: [{ state: "q0", tape: "├A[∆]" }], verdict: "accept" } as unknown as Answer;
    const { sent } = renderResponse(TM, "a", saved, true);
    expect((screen.getAllByTestId("machine-trace-row")[0].querySelector("input[type=text]") as HTMLInputElement).value).toBe("├A∆");
    expect((screen.getByLabelText("موضع الرأس") as HTMLSelectElement).value).toBe("2");
    expect((screen.getByLabelText("الكلمة مقبولة") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /أضف خطوة/ }));
    expect(sent).toEqual([]);
    cleanup();
    render(<MachineTraceResponse q={q({ ...DFA, start: "zz" }, "ab")} id="x" answer={undefined} onAnswer={() => { throw new Error("no"); }} labelPrefix="" />);
    expect(screen.getByTestId("machine-trace-unavailable")).toBeTruthy();
  });
});

describe("A15a — the teacher", () => {
  it("the notation round-trips every kind: format → parse gives the machine back", () => {
    for (const m of [DFA, NFA, PDA, TM]) {
      const back = parseTraceNotation(formatTraceNotation(m)).machine;
      expect(engineOfTraceMachine(back), m.kind).toEqual(engineOfTraceMachine(m));
    }
    expect(parseTraceNotation({ kind: "PDA", alphabet: "a", start: "q0", accept: "", transitions: "q0 -> q1 : ادفع a,⏊/A\nnot a line", leftEnd: false }).badLines).toEqual([2]);
  });

  it("writes the machine and the word; the key stays empty; the table and the true run are shown; issues block finalization", () => {
    const patches: Record<string, unknown>[] = [];
    let node = { examQuestionId: "t1", presentationType: "machineTrace", questionTypeVersion: 1, text: "تتبّع", marks: 4, machineTrace: { v: 1, machine: DFA, word: "ab" }, answer: {} } as Record<string, unknown>;
    const view = render(<MachineTraceEditor node={node as never} onChange={p => { patches.push(p as never); node = { ...node, ...p }; }} />);
    expect(screen.getByTestId("machine-trace-preview")).toBeTruthy();
    expect(within(screen.getByTestId("machine-trace-true-run")).getAllByRole("listitem").map(li => li.textContent)).toEqual(["q0", "q1", "q0"]);
    fireEvent.change(screen.getByLabelText(/الكلمة التي يتتبّعها الطالب/), { target: { value: "aa" } });
    expect(patches.at(-1)).toEqual({ machineTrace: { v: 1, machine: DFA, word: "aa" }, answer: {} });
    view.rerender(<MachineTraceEditor node={node as never} onChange={p => { patches.push(p as never); node = { ...node, ...p }; }} />);
    expect(within(screen.getByTestId("machine-trace-true-run")).getAllByRole("listitem").map(li => li.textContent)).toEqual(["q0", "q1", "q1"]);
    fireEvent.change(screen.getByLabelText(/الانتقالات، سطر لكل انتقال/), { target: { value: "q0 a q9 q1\nq0 b q0" } });
    expect(screen.getByTestId("machine-trace-bad-lines").textContent).toMatch(/1/);
    fireEvent.change(screen.getByLabelText("حالة البداية"), { target: { value: "" } });
    view.rerender(<MachineTraceEditor node={node as never} onChange={p => { patches.push(p as never); node = { ...node, ...p }; }} />);
    expect(screen.getByTestId("machine-trace-issues")).toBeTruthy();
    expect(validateMachineTraceQuestion(node).length).toBeGreaterThan(0);
  });
});

describe("AUTO-A15b — the review and the released breakdown", () => {
  it("the teacher's review: the machine, the word, the student's rows beside the true run with each part, rows past the run noted", async () => {
    const { default: MachineTraceReview } = await import("../automata/MachineTraceReview");
    const answer = { kind: "machineTrace", rows: [{ state: "q0" }, { state: "q0" }, { state: "q1" }, { state: "q0" }], verdict: "accept" };
    render(<MachineTraceReview config={{ v: 1, machine: DFA, word: "ab" }} answer={answer} />);
    const table = screen.getByTestId("trace-review-compare");
    const rows = within(table).getAllByRole("row").slice(1).map(r => [...r.querySelectorAll("th,td")].map(c => c.textContent));
    // ab: q0 -a→ q1 -b→ q0 → reject; the student's row 1 (q0) is wrong, row 2 (q1) is the step from it on «b»? q0 -b→ q0 — no: wrong too
    expect(rows).toEqual([["0", "q0", "q0", "✓ صحيح"], ["1", "q0", "q1", "✗ خطأ"], ["2", "q1", "q0", "✗ خطأ"], ["النتيجة", "مقبولة", "مرفوضة", "✗ خطأ"]]);
    expect(within(table).getByText(/1 من 4 أجزاء صحيحة/)).toBeTruthy();
    expect(screen.getByText(/كتب الطالب 1 سطرًا بعد نهاية التشغيل الصحيح/)).toBeTruthy();
    cleanup();
    render(<MachineTraceReview config={{ v: 1, machine: { ...DFA, start: "zz" }, word: "ab" }} answer={answer} />);
    expect(screen.getByTestId("trace-review-unavailable")).toBeTruthy();
  });
  it("the student's released breakdown shows the same table from the server's data", async () => {
    const { default: ResultBreakdown } = await import("../student/exam/ResultBreakdown");
    const breakdown = { sections: [], questions: [{ number: 1, sectionId: "", status: "partial" as const, maxMarks: 4, score: 2, trace: { rows: [{ mine: "q0", truth: "q0", right: true }, { mine: "q0", truth: "q1", right: false }], verdict: { mine: "reject" as const, truth: "reject" as const, right: true } } }] };
    render(<ResultBreakdown breakdown={breakdown} />);
    const t = screen.getByTestId("breakdown-trace");
    expect(within(t).getAllByRole("row").slice(1).map(r => r.getAttribute("data-right"))).toEqual(["yes", "no", "yes"]);
  });
});
