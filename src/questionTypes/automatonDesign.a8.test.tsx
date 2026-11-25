// @vitest-environment happy-dom
// AUTO-A8 — automatonDesign@1 UI: the palette offers «تصميم أوتومات» under «تفاعلي» and creates the question with its rules and NO reference
// (finalization blocks); the teacher's editor writes the rules and the PRIVATE reference built with the book exercises' builder; the
// student's renderer builds a machine with the same builder and answers with the machine only (never a verdict, never the layout), shows a
// saved answer again, is read-only when disabled, and never holds the reference (the sanitizer removed it).
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
import AutomatonDesignEditor from "./editors/AutomatonDesignEditor";
import AutomatonDesignResponse from "./student/AutomatonDesignResponse";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer } from "./studentRegistry";
import { chipsFor, typeDescription } from "./typePresentation";
import { questionTypeDefinition } from "../questionTypeCatalog";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

const coarse = () => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })));
beforeEach(() => { coarse(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-A8", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });

const CFG = { v: 1, machine: "DFA", alphabet: ["0", "1"], maxStates: 3, complete: true };
const REF = { states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [["q0", "0", "q0"], ["q0", "1", "q1"], ["q1", "0", "q0"], ["q1", "1", "q1"]] };
const question = (cfg: unknown = CFG, answer: unknown = { reference: REF }) => newQuestion("automatonDesign" as never, { examQuestionId: "a1", text: "صمّم", automatonDesign: cfg, answer } as never) as BuilderQuestion;
const cell = (scope: HTMLElement, from: string, symbol: string) => within(scope).getByRole("combobox", { name: "من " + from + " بالرمز " + symbol + " إلى" }) as HTMLSelectElement;

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} />;
}

describe("A8 — registration and the palette", () => {
  it("one editor and one renderer, for exactly version 1; a description that says how it is graded", () => {
    expect(resolveAuthoringEditor("automatonDesign", 1)).toBeTruthy();
    expect(resolveStudentRenderer("automatonDesign", 1)).toBeTruthy();
    expect(resolveAuthoringEditor("automatonDesign", 2)).toBeFalsy();
    expect(resolveStudentRenderer("automatonDesign", 2)).toBeFalsy();
    const def = questionTypeDefinition("automatonDesign")!;
    expect(typeDescription(def)).toMatch(/العلامة كاملة أو صفر/);
    expect(chipsFor(def)).not.toContain("علامة جزئية");
  });
  it("«تصميم أوتومات» under «تفاعلي» creates automatonDesign@1 with its rules, no reference, and the editor's blocker", async () => {
    let hist!: Hist;
    render(<Host initial={baseExam([newQuestion("multipleChoice", { examQuestionId: "q0", text: "س" })])} onHistory={h => { hist = h; }} />);
    await tick(30);
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    fireEvent.click(within(d).getByRole("tab", { name: "تفاعلي" })); await tick();
    const card = within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "automatonDesign");
    expect(card?.textContent).toContain("تصميم أوتومات");
    fireEvent.click(card!); await tick(80);
    const q = hist.present!.sections[0].questions[1] as unknown as Record<string, unknown>;
    expect([q.presentationType, q.questionTypeVersion, q.automatonDesign, q.answer]).toEqual(["automatonDesign", 1, { v: 1, machine: "DFA", alphabet: ["a", "b"], maxStates: 4 }, {}]);
    const ed = await screen.findByTestId("qt-editor-automatonDesign");
    expect(within(ed).getByTestId("automaton-question-issues").textContent).toContain("الآلة النموذجية (مفتاح التصحيح) مفقودة");
  });
});

describe("A8 — the teacher's editor", () => {
  function Editor({ initial, spy }: { initial: BuilderQuestion; spy?: (n: Record<string, unknown>) => void }) {
    const [node, setNode] = useState(initial);
    return <AutomatonDesignEditor node={node as never} onChange={patch => setNode(n => { const next = { ...n, ...patch } as BuilderQuestion; spy?.(next as never); return next; })} />;
  }
  it("building the reference writes it to the private key; the issues clear when the question is complete", async () => {
    const seen: Record<string, unknown>[] = [];
    render(<Editor initial={question(CFG, {})} spy={n => seen.push(n)} />);
    const ref = screen.getByTestId("automaton-reference");
    expect(within(ref).getByRole("note").textContent).toContain("ابنِ الآلة النموذجية");
    fireEvent.click(within(ref).getByRole("button", { name: /إضافة حالة/ }));
    fireEvent.click(within(ref).getAllByRole("checkbox", { name: "قبول" })[1]);
    fireEvent.change(cell(ref, "q0", "0"), { target: { value: "q0" } });
    fireEvent.change(cell(ref, "q0", "1"), { target: { value: "q1" } });
    fireEvent.change(cell(ref, "q1", "0"), { target: { value: "q0" } });
    fireEvent.change(cell(ref, "q1", "1"), { target: { value: "q1" } });
    const last = seen.at(-1) as { answer: { reference: typeof REF }; automatonDesign: unknown };
    expect(last.answer.reference).toEqual(REF);
    expect(last.automatonDesign).toEqual(CFG);
    expect(screen.queryByTestId("automaton-question-issues")).toBeNull();
    expect(within(ref).getByText(/الآلة النموذجية/, { selector: "h4" })).toBeTruthy();
  });
  it("the rules: type, alphabet, the student's state limit, completeness (DFA only), example words checked against the reference", async () => {
    const seen: Record<string, unknown>[] = [];
    render(<Editor initial={question()} spy={n => seen.push(n)} />);
    const rules = () => (seen.at(-1) as { automatonDesign: Record<string, unknown> }).automatonDesign;
    fireEvent.change(screen.getByLabelText(/أقصى عدد لحالات آلة الطالب/), { target: { value: "5" } });
    expect(rules().maxStates).toBe(5);
    fireEvent.change(screen.getByLabelText(/كلمات أمثلة تُقبل/), { target: { value: "1 01 ε" } });
    expect(rules().examples).toEqual({ accept: ["1", "01", ""], reject: [] });
    expect(screen.getByTestId("automaton-question-issues").textContent).toContain("«ε» في الأمثلة المقبولة، لكن الآلة النموذجية ترفضها");
    fireEvent.change(screen.getByLabelText(/كلمات أمثلة تُقبل/), { target: { value: "1 01" } });
    expect(screen.queryByTestId("automaton-question-issues")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /غير حتمي/ }));
    expect(rules().machine).toBe("NFA");
    expect(rules().complete).toBeUndefined();                                    // completeness is for a DFA only
    expect(screen.queryByRole("checkbox", { name: /أوتومات كامل/ })).toBeNull();
    expect(within(screen.getByTestId("automaton-reference")).getByRole("group", { name: "من q0 بالرمز ε إلى" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/الأبجدية/), { target: { value: "0, 1, 2" } });
    expect(rules().alphabet).toEqual(["0", "1", "2"]);
    expect((seen.at(-1) as { answer: { reference: typeof REF } }).answer.reference.transitions).toEqual(REF.transitions);
  });
});

describe("AUTO-A9 — the teacher's reference keeps its layout", () => {
  function Editor({ initial, spy }: { initial: BuilderQuestion; spy?: (n: Record<string, unknown>) => void }) {
    const [node, setNode] = useState(initial);
    return <AutomatonDesignEditor node={node as never} onChange={patch => setNode(n => { const next = { ...n, ...patch } as BuilderQuestion; spy?.(next as never); return next; })} />;
  }
  it("moving a reference state (desktop) writes where it was put beside the reference; reopening draws it there", () => {
    vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === "(pointer: fine)", media: q, addEventListener() {}, removeEventListener() {} })));
    const seen: Record<string, unknown>[] = [];
    render(<Editor initial={question()} spy={n => seen.push(n)} />);
    const ref = screen.getByTestId("automaton-reference");
    fireEvent.change(within(ref).getByLabelText("الحالة"), { target: { value: "q1" } });
    fireEvent.click(within(within(ref).getByRole("group", { name: "انقل q1 خانة" })).getByRole("button", { name: "أسفل" }));
    const key = (seen.at(-1) as { answer: { reference: unknown; layout?: Record<string, [number, number]> } }).answer;
    expect(key.reference).toEqual(REF);
    expect(key.layout?.q1).toBeTruthy();
    cleanup();
    render(<Editor initial={question(CFG, key)} />);
    const ys = [...screen.getByTestId("automaton-reference").querySelectorAll("g.learning-automaton-state")].map(g => [g.querySelector("text")?.textContent, Number(g.querySelector("circle")?.getAttribute("cy"))]);
    const y = Object.fromEntries(ys);
    expect(y.q1).toBeGreaterThan(y.q0 as number);                               // q1 one row below q0, as it was put
  });
});

describe("A8 — the student's renderer", () => {
  const studentQ = (cfg: unknown = CFG) => sanitizeExamForStudent(baseExam([question(cfg)])).sections[0].questions[0];
  function Student({ q, initial, disabled, spy }: { q: Question; initial?: Answer; disabled?: boolean; spy?: (a: Answer) => void }) {
    const [a, setA] = useState<Answer | undefined>(initial);
    return <AutomatonDesignResponse q={q} id="a1" labelPrefix="" answer={a} disabled={disabled} onAnswer={n => { spy?.(n); setA(n); }} />;
  }
  it("the sanitized question carries the rules, never the reference; the builder shows them", () => {
    const q = studentQ();
    expect(JSON.stringify(q)).not.toMatch(/"reference"|"transitions"/);
    render(<Student q={q} />);
    const r = screen.getByTestId("automaton-design-response");
    expect(within(r).getByRole("list", { name: "شروط التمرين" }).textContent).toMatch(/حتمي.*\{0, 1\}.*حتى 3 حالات.*كامل/s);
    expect(r.textContent).not.toMatch(/تحقّق من الآلة|صحيحة/);
  });
  it("each edit answers with the machine only — states, start, accepting states, arrows — and counts as answered", () => {
    const sent: Answer[] = [];
    render(<Student q={studentQ()} spy={a => sent.push(a)} />);
    const r = screen.getByTestId("automaton-design-response");
    fireEvent.click(within(r).getByRole("button", { name: /إضافة حالة/ }));
    fireEvent.click(within(r).getAllByRole("checkbox", { name: "قبول" })[1]);
    fireEvent.change(cell(r, "q0", "1"), { target: { value: "q1" } });
    const last = sent.at(-1) as Extract<Answer, { kind: "automatonDesign" }>;
    expect(Object.keys(last).sort()).toEqual(["kind", "machine"]);
    expect(last.machine).toEqual({ states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [["q0", "1", "q1"]] });
    expect(answered(last)).toBe(true);
    expect(answered({ kind: "automatonDesign", machine: { states: ["q0"], start: "q0", accept: [], transitions: [] } })).toBe(false);
    expect(within(r).getByTestId("autodesign-quick").textContent).toContain("ينقص أسهم");
  });
  it("a saved answer is shown again; «جرّب كلمة» runs the student's machine; disabled is read-only", () => {
    const saved: Answer = { kind: "automatonDesign", machine: REF as never };
    const spy = vi.fn();
    render(<Student q={studentQ()} initial={saved} disabled spy={spy} />);
    const r = screen.getByTestId("automaton-design-response");
    expect(cell(r, "q1", "0").value).toBe("q0");
    expect((cell(r, "q1", "0").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);   // every control of the builder is off
    expect(within(r).queryByTestId("alab-canvas")).toBeNull();
    fireEvent.change(cell(r, "q1", "0"), { target: { value: "q1" } });
    expect(spy).not.toHaveBeenCalled();
    cleanup();
    render(<Student q={studentQ()} initial={saved} />);
    fireEvent.change(screen.getByLabelText("جرّب كلمة على آلتك"), { target: { value: "0101" } });
    fireEvent.click(screen.getByRole("button", { name: "شغّل" }));
    expect(screen.getByRole("status").textContent).toContain("آلتك تقبل الكلمة 0101");
  });
  // AUTO-A9 (owner request «ابدأ بحفظ أماكن الحالات») — this test pinned the A8 behaviour «moving a state saves nothing»; it now pins the
  // decided one: a move saves the SAME machine with where the state was put, and a saved answer comes back drawn as it was left.
  it("AUTO-A9 — on a desktop, moving a state saves the same machine with its layout; the saved answer comes back where it was left", () => {
    vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === "(pointer: fine)", media: q, addEventListener() {}, removeEventListener() {} })));
    const sent: Answer[] = [];
    render(<Student q={studentQ()} spy={a => sent.push(a)} />);
    const r = screen.getByTestId("automaton-design-response");
    fireEvent.click(within(r).getByRole("button", { name: /إضافة حالة/ }));
    expect(sent).toHaveLength(1);
    const before = sent[0] as Extract<Answer, { kind: "automatonDesign" }>;
    fireEvent.change(within(r).getByLabelText("الحالة"), { target: { value: "q1" } });
    fireEvent.click(within(within(r).getByRole("group", { name: "انقل q1 خانة" })).getByRole("button", { name: "أسفل" }));
    expect(within(r).getByText("نُقلت q1.")).toBeTruthy();
    expect(sent).toHaveLength(2);
    const moved = sent[1] as Extract<Answer, { kind: "automatonDesign" }>;
    expect(moved.machine).toEqual(before.machine);                              // the same machine: the same grade
    expect(moved.layout?.q1).toBeTruthy();
    const q1Cell = moved.layout!.q1;
    fireEvent.click(within(within(r).getByRole("group", { name: "انقل q1 خانة" })).getByRole("button", { name: "أسفل" }));
    fireEvent.click(within(within(r).getByRole("group", { name: "انقل q1 خانة" })).getByRole("button", { name: "أعلى" }));
    expect((sent.at(-1) as typeof moved).layout!.q1).toEqual(q1Cell);
    const circleY = () => Number([...screen.getByTestId("alab-canvas").querySelectorAll("g.learning-automaton-state")].find(g => g.querySelector("text")?.textContent === "q1")!.querySelector("circle")!.getAttribute("cy"));
    const y = circleY();
    cleanup();
    render(<Student q={studentQ()} initial={sent.at(-1)} />);
    expect(circleY()).toBe(y);                                                    // restored where it was left
    fireEvent.change(cell(screen.getByTestId("automaton-design-response"), "q0", "1"), { target: { value: "q1" } });
  });
  it("a config that does not read shows a note (never a broken builder)", () => {
    render(<AutomatonDesignResponse q={{ text: "س", marks: 1, automatonDesign: { v: 1, machine: "TM" } } as never} id="a1" labelPrefix="" answer={undefined} onAnswer={() => {}} />);
    expect(screen.getByTestId("automaton-design-unavailable")).toBeTruthy();
  });
});
