// @vitest-environment happy-dom
// AUTO-A12 (owner request «ابدأ بحفظ أماكن الحالات في سؤال الآلة») — machineDesign@1 keeps where the states were put on the drawing, as
// AUTO-A9 does for automatonDesign@1: on a desktop, moving a state saves the SAME machine with its layout (presentation only — the grader
// never reads it); a saved answer comes back drawn where it was left; the teacher's reference keeps its layout too; the review draws both
// machines in their places.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { BuilderQuestion, StructuredExam } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { Answer } from "../answerState";
import MachineDesignEditor from "./editors/MachineDesignEditor";
import MachineDesignResponse from "./student/MachineDesignResponse";
import MachineDesignReview from "../automata/MachineDesignReview";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

const fine = () => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === "(pointer: fine)", media: q, addEventListener() {}, removeEventListener() {} })));
beforeEach(fine);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const tm = (from: string, read: string, write: string, move: string, to: string) => ({ from, read, write, move, to });
const CFG = { v: 1, machine: "TM", alphabet: ["a", "b"], maxStates: 6, leftEnd: true };
const REF = { states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [tm("q0", "a", "a", "S", "q1")] };
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-A12", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
const question = (cfg: unknown = CFG, answer: unknown = { reference: REF }) => newQuestion("machineDesign" as never, { examQuestionId: "m1", text: "صمّم", machineDesign: cfg, answer } as never) as BuilderQuestion;
const moveDown = (scope: HTMLElement, q: string) => {
  fireEvent.change(within(scope).getByLabelText("الحالة"), { target: { value: q } });
  fireEvent.click(within(within(scope).getByRole("group", { name: "انقل " + q + " خانة" })).getByRole("button", { name: "أسفل" }));
};
const ys = (el: Element) => Object.fromEntries([...el.querySelectorAll("g.learning-automaton-state")].map(g => [g.querySelector("text")?.textContent, Number(g.querySelector("circle")?.getAttribute("cy"))]));

describe("A12 — the student's answer keeps where the states were put", () => {
  const studentQ = () => sanitizeExamForStudent(baseExam([question()])).sections[0].questions[0];
  function Student({ initial, spy }: { initial?: Answer; spy?: (a: Answer) => void }) {
    const [a, setA] = useState<Answer | undefined>(initial);
    return <MachineDesignResponse q={studentQ()} id="m1" labelPrefix="" answer={a} onAnswer={n => { spy?.(n); setA(n); }} />;
  }
  it("on a desktop, moving a state saves the same machine with its layout; the saved answer comes back where it was left", () => {
    const sent: Answer[] = [];
    render(<Student spy={a => sent.push(a)} />);
    const r = screen.getByTestId("machine-design-response");
    fireEvent.click(within(r).getByRole("button", { name: /إضافة حالة/ }));
    const before = sent.at(-1) as Extract<Answer, { kind: "machineDesign" }>;
    expect(before.layout).toBeUndefined();                                           // nothing moved yet: the book's automatic layout
    moveDown(r, "q1");
    expect(within(r).getByText("نُقلت q1.")).toBeTruthy();
    const moved = sent.at(-1) as Extract<Answer, { kind: "machineDesign" }>;
    expect(moved.machine).toEqual(before.machine);                                   // the same machine: the same grade
    expect(moved.layout?.q1).toBeTruthy();
    const y = ys(screen.getByTestId("alab-canvas")).q1;
    cleanup();
    render(<Student initial={sent.at(-1)} />);
    expect(ys(screen.getByTestId("alab-canvas")).q1).toBe(y);                        // restored where it was left
  });
  it("AUTO-A16b — a saved place between the cells comes back there (half a cell is half the distance of a whole one)", () => {
    vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === "(pointer: fine)", media: q, addEventListener() {}, removeEventListener() {} })));
    const saved = (row: number) => ({ kind: "machineDesign", machine: { states: ["q0", "q1"], start: "q0", accept: [], transitions: [] }, layout: { q0: [0, 0], q1: [0, row] } }) as unknown as Answer;
    render(<Student initial={saved(0.5)} />);
    const half = ys(screen.getByTestId("alab-canvas"));
    cleanup();
    render(<Student initial={saved(1)} />);
    const whole = ys(screen.getByTestId("alab-canvas"));
    expect((half.q1 - half.q0) / (whole.q1 - whole.q0)).toBeCloseTo(0.5, 5);         // not a whole cell, and not dropped
  });
  it("a phone has no drawing: no layout is invented, and a saved layout is kept untouched by an edit of the rows", () => {
    vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })));
    const sent: Answer[] = [];
    const saved = { kind: "machineDesign", machine: { states: ["q0", "q1"], start: "q0", accept: [], transitions: [] }, layout: { q1: [3, 2] } } as unknown as Answer;
    render(<Student initial={saved} spy={a => sent.push(a)} />);
    const r = screen.getByTestId("machine-design-response");
    expect(within(r).queryByTestId("alab-canvas")).toBeNull();
    fireEvent.click(within(r).getAllByRole("checkbox", { name: "قبول" })[1]);
    expect((sent.at(-1) as { layout?: unknown }).layout).toEqual({ q1: [3, 2] });
  });
});

describe("A12 — the teacher's reference keeps its layout; the review draws both in their places", () => {
  function Editor({ initial, spy }: { initial: BuilderQuestion; spy?: (n: Record<string, unknown>) => void }) {
    const [node, setNode] = useState(initial);
    return <MachineDesignEditor node={node as never} onChange={patch => setNode(n => { const next = { ...n, ...patch } as BuilderQuestion; spy?.(next as never); return next; })} />;
  }
  it("moving a reference state writes where it was put beside the reference; reopening draws it there", () => {
    const seen: Record<string, unknown>[] = [];
    render(<Editor initial={question()} spy={n => seen.push(n)} />);
    const ref = screen.getByTestId("machine-reference");
    moveDown(ref, "q1");
    const key = (seen.at(-1) as { answer: { reference: unknown; layout?: Record<string, [number, number]> } }).answer;
    expect(key.reference).toEqual(REF);
    expect(key.layout?.q1).toBeTruthy();
    expect(screen.queryByTestId("machine-question-issues")).toBeNull();               // a layout is a valid part of the key
    cleanup();
    render(<Editor initial={question(CFG, key)} />);
    const y = ys(screen.getByTestId("machine-reference"));
    expect(y.q1).toBeGreaterThan(y.q0);                                                // q1 below q0, as it was put
  });
  it("the review draws the student's machine and the reference where their authors put the states", () => {
    const answer = { kind: "machineDesign", machine: { ...REF, states: ["p0", "p1"], start: "p0", accept: ["p1"], transitions: [tm("p0", "a", "a", "S", "p1")] }, layout: { p0: [0, 3], p1: [0, 0] } };
    render(<MachineDesignReview answer={answer} answerKey={{ reference: REF, layout: { q0: [0, 0], q1: [0, 3] } }} config={CFG} />);
    const mine = ys(screen.getByTestId("machine-review-student")), ref = ys(screen.getByTestId("machine-review-reference"));
    expect(mine.p0).toBeGreaterThan(mine.p1);                                          // p0 put below p1
    expect(ref.q1).toBeGreaterThan(ref.q0);
  });
  it("AUTO-A16b — the review draws places between the cells (half a cell is half the distance of a whole one)", () => {
    const gaps = (row: number) => {
      cleanup();
      const answer = { kind: "machineDesign", machine: { ...REF, states: ["p0", "p1"], start: "p0", accept: ["p1"], transitions: [tm("p0", "a", "a", "S", "p1")] }, layout: { p0: [0, 0], p1: [0, row] } };
      render(<MachineDesignReview answer={answer} answerKey={{ reference: REF, layout: { q0: [0, 0], q1: [0, row] } }} config={CFG} />);
      const mine = ys(screen.getByTestId("machine-review-student")), ref = ys(screen.getByTestId("machine-review-reference"));
      return [mine.p1 - mine.p0, ref.q1 - ref.q0];
    };
    const half = gaps(0.5), whole = gaps(1);
    expect(half[0] / whole[0]).toBeCloseTo(0.5, 5);
    expect(half[1] / whole[1]).toBeCloseTo(0.5, 5);
  });
});
