// @vitest-environment happy-dom
// AUTO-A11a — machineDesign@1 UI: the palette offers «تصميم آلة: مكدّس أو تورنغ» under «تفاعلي» and creates the question with its rules
// and NO reference (finalization blocks); the teacher's editor writes the rules (a push-down automaton or a Turing machine, recognise or
// compute, ├, the longest word tried, examples) and the PRIVATE reference built with the book exercises' builder; the student's renderer
// builds a machine with the same builder and answers with the machine only (never a verdict), shows a saved answer again, is read-only when
// disabled, and never holds the reference (the sanitizer removed it).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { Answer } from "../answerState";
import { answered } from "../answerState";
import MachineDesignEditor from "./editors/MachineDesignEditor";
import MachineDesignResponse from "./student/MachineDesignResponse";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer } from "./studentRegistry";
import { typeDescription } from "./typePresentation";
import { questionTypeDefinition } from "../questionTypeCatalog";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

beforeEach(() => { vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-A11", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });

const TM_CFG = { v: 1, machine: "TM", mode: "compute", alphabet: ["1"], maxStates: 8, leftEnd: true, examples: { compute: [{ word: "1", output: "" }] } };
const tmMove = (from: string, read: string, write: string, move: string, to: string) => ({ from, read, write, move, to });
// a small reference for the UI: q0 —1/$,R→ q1, q1 —∆/$,S→ q2 (accept) — on «1» it leaves «$$», the answer «» (ε)
const REF = { states: ["q0", "q1", "q2"], start: "q0", accept: ["q2"], transitions: [tmMove("q0", "1", "$", "R", "q1"), tmMove("q1", "∆", "$", "S", "q2")] };
const question = (cfg: unknown = TM_CFG, answer: unknown = { reference: REF }) => newQuestion("machineDesign" as never, { examQuestionId: "m1", text: "صمّم", machineDesign: cfg, answer } as never) as BuilderQuestion;

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} />;
}

describe("A11a — registration and the palette", () => {
  it("one editor and one renderer, for exactly version 1; a description that says how it is graded (not a proof)", () => {
    expect(resolveAuthoringEditor("machineDesign", 1)).toBeTruthy();
    expect(resolveStudentRenderer("machineDesign", 1)).toBeTruthy();
    expect(resolveAuthoringEditor("machineDesign", 2)).toBeFalsy();
    expect(resolveStudentRenderer("machineDesign", 2)).toBeFalsy();
    const d = typeDescription(questionTypeDefinition("machineDesign")!);
    expect(d).toMatch(/وليس برهانًا/);
    expect(d).toMatch(/لا تتوقف إلى مراجعة المعلم/);
  });
  it("«تصميم آلة» under «تفاعلي» creates machineDesign@1 with its rules, no reference, and the editor's blocker", async () => {
    let hist!: Hist;
    render(<Host initial={baseExam([newQuestion("multipleChoice", { examQuestionId: "q0", text: "س" })])} onHistory={h => { hist = h; }} />);
    await tick(30);
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    fireEvent.click(within(d).getByRole("tab", { name: "تفاعلي" })); await tick();
    const card = within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "machineDesign");
    expect(card?.textContent).toContain("تصميم آلة: مكدّس أو تورنغ");
    fireEvent.click(card!); await tick(80);
    const q = hist.present!.sections[0].questions[1] as unknown as Record<string, unknown>;
    expect([q.presentationType, q.questionTypeVersion, q.machineDesign, q.answer]).toEqual(["machineDesign", 1, { v: 1, machine: "PDA", alphabet: ["a", "b"], maxStates: 6 }, {}]);
    const ed = await screen.findByTestId("qt-editor-machineDesign");
    expect(within(ed).getByTestId("machine-question-issues").textContent).toContain("الآلة النموذجية (مفتاح التصحيح) مفقودة");
  });
});

describe("A11a — the teacher's editor", () => {
  function Editor({ initial, spy }: { initial: BuilderQuestion; spy?: (n: Record<string, unknown>) => void }) {
    const [node, setNode] = useState(initial);
    return <MachineDesignEditor node={node as never} onChange={patch => setNode(n => { const next = { ...n, ...patch } as BuilderQuestion; spy?.(next as never); return next; })} />;
  }
  const last = (seen: Record<string, unknown>[]) => seen.at(-1) as { machineDesign: Record<string, unknown>; answer: { reference?: typeof REF } };
  it("a push-down question → a Turing machine (on the book's tape ├), then «تحسب دالة»; the reference built with the rows is the private key", () => {
    const seen: Record<string, unknown>[] = [];
    render(<Editor initial={question({ v: 1, machine: "PDA", alphabet: ["a", "b"], maxStates: 6 }, {})} spy={n => seen.push(n)} />);
    expect(screen.queryByRole("checkbox", { name: /بداية الشريط/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /آلة تورنغ/ }));
    expect(last(seen).machineDesign).toEqual({ v: 1, machine: "TM", alphabet: ["a", "b"], maxStates: 6, leftEnd: true });
    fireEvent.click(screen.getByRole("radio", { name: /تحسب دالة/ }));
    expect(last(seen).machineDesign.mode).toBe("compute");
    fireEvent.change(screen.getByLabelText(/^الأبجدية \(رموز/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/أطول كلمة يجرّبها التصحيح/), { target: { value: "10" } });
    expect(last(seen).machineDesign).toEqual({ v: 1, machine: "TM", mode: "compute", alphabet: ["1"], maxStates: 6, leftEnd: true, maxLength: 10 });
    expect(last(seen).answer).toEqual({});                                         // no reference before the teacher builds one
    const ref = screen.getByTestId("machine-reference");
    fireEvent.click(within(ref).getByRole("button", { name: "إضافة انتقال" }));
    fireEvent.change(within(ref).getByLabelText("الانتقال 1: يكتب"), { target: { value: "$" } });
    fireEvent.change(within(ref).getByLabelText("الانتقال 1: الحركة"), { target: { value: "S" } });
    fireEvent.click(within(ref).getAllByRole("checkbox", { name: "قبول" })[0]);
    expect(last(seen).answer.reference).toEqual({ states: ["q0"], start: "q0", accept: ["q0"], transitions: [tmMove("q0", "1", "$", "S", "q0")] });
    expect(screen.queryByTestId("machine-question-issues")).toBeNull();
  });
  it("on a desktop (the drawing editor shown) the rules' radios and the drawing's are separate groups: choosing «تحسب دالة» keeps the drawing's mode", () => {
    vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: /fine|hover/.test(q), media: q, addEventListener() {}, removeEventListener() {} })));
    render(<Editor initial={question({ v: 1, machine: "TM", alphabet: ["1"], maxStates: 6, leftEnd: true }, {})} />);
    const ref = screen.getByTestId("machine-reference");
    const drawing = within(ref).getAllByRole("radio").filter(r => !(r as HTMLInputElement).name.endsWith("-start"));
    expect(drawing.length).toBeGreaterThan(0);                                       // the drawing editor's mode radios
    const before = drawing.map(r => (r as HTMLInputElement).checked);
    fireEvent.click(screen.getByRole("radio", { name: /تحسب دالة/ }));
    expect((screen.getByRole("radio", { name: /تحسب دالة/ }) as HTMLInputElement).checked).toBe(true);
    expect(drawing.map(r => (r as HTMLInputElement).checked)).toEqual(before);
    const names = (el: HTMLElement) => new Set(within(el).queryAllByRole("radio").map(r => (r as HTMLInputElement).name));
    const rules = [...names(screen.getByRole("radiogroup", { name: "ما تفعله الآلة" })), ...names(screen.getByRole("radiogroup", { name: "نوع الآلة" }))];
    for (const n of rules) expect(names(ref).has(n), n).toBe(false);
  });
  it("a function's examples are word=output pairs (never a field named `answer`), checked against the reference", () => {
    const seen: Record<string, unknown>[] = [];
    render(<Editor initial={question({ ...TM_CFG, examples: undefined })} spy={n => seen.push(n)} />);
    fireEvent.change(screen.getByLabelText(/أمثلة: كلمة=جواب/), { target: { value: "1=1" } });
    expect(last(seen).machineDesign.examples).toEqual({ compute: [{ word: "1", output: "1" }] });
    expect(screen.getByTestId("machine-question-issues").textContent).toContain("على الكلمة «1» الجواب في الأمثلة «1»، والآلة النموذجية تعطي «ε»");
    fireEvent.change(screen.getByLabelText(/أمثلة: كلمة=جواب/), { target: { value: "1=ε" } });
    expect(last(seen).machineDesign.examples).toEqual({ compute: [{ word: "1", output: "" }] });
    expect(screen.queryByTestId("machine-question-issues")).toBeNull();
  });
});

describe("A11a — the student's renderer", () => {
  const studentQuestion = () => sanitizeExamForStudent(baseExam([question()])).sections[0].questions[0];
  function Student({ initial, disabled, spy }: { initial?: Answer; disabled?: boolean; spy?: (a: Answer) => void }) {
    const [answer, setAnswer] = useState<Answer | undefined>(initial);
    return <MachineDesignResponse q={studentQuestion()} id="m1" labelPrefix="" answer={answer} onAnswer={a => { spy?.(a); setAnswer(a); }} disabled={disabled} />;
  }
  it("the student receives the rules, never the reference; the answer is the machine as written (never a verdict)", () => {
    expect(JSON.stringify(studentQuestion())).not.toMatch(/"reference"/);
    const seen: Answer[] = [];
    render(<Student spy={a => seen.push(a)} />);
    const box = screen.getByTestId("machine-design-response");
    expect(box.textContent).toContain("1 → $$");
    expect(box.textContent).not.toMatch(/تحقّق من الآلة/);
    fireEvent.click(within(box).getByRole("button", { name: "إضافة انتقال" }));
    fireEvent.change(within(box).getByLabelText("الانتقال 1: يكتب"), { target: { value: "$" } });
    const a = seen.at(-1) as { kind: string; machine: { transitions: unknown[] } };
    expect(Object.keys(a).sort()).toEqual(["kind", "machine"]);
    expect(a.kind).toBe("machineDesign");
    expect(a.machine).toEqual({ states: ["q0"], start: "q0", accept: [], transitions: [tmMove("q0", "1", "$", "R", "q0")] });
    expect(answered(seen.at(-1))).toBe(true);
  });
  it("a saved answer comes back as it was left, read-only when disabled", () => {
    const saved = { kind: "machineDesign", machine: REF } as unknown as Answer;
    render(<Student initial={saved} disabled />);
    const box = screen.getByTestId("machine-design-response");
    expect((within(box).getByLabelText("الانتقال 2: يقرأ") as HTMLInputElement).value).toBe("∆");
    expect(within(box).getAllByRole("checkbox", { name: "قبول" }).map(c => (c as HTMLInputElement).checked)).toEqual([false, false, true]);
    expect((within(box).getByRole("button", { name: "إضافة انتقال" }).closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);   // every control off
  });
  it("rules that do not read show a note — the answer is never touched", () => {
    render(<MachineDesignResponse q={{ text: "", marks: 1, presentationType: "machineDesign", machineDesign: { v: 9 } } as never} id="m1" labelPrefix="" answer={undefined} onAnswer={() => {}} />);
    expect(screen.getByTestId("machine-design-unavailable").textContent).toContain("أبلغ معلّمك");
  });
});
