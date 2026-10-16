// @vitest-environment happy-dom
//
// Phase 21F.1 — render isolation: typing into ONE question re-renders that question's editor only. The other cards receive the
// same question object, the same stable callbacks and the same issue arrays, so React skips them. Counted on the shared
// QuestionComposer (one per card) through a transparent spy.
import { describe, it, expect, afterEach, vi } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import type { BuilderQuestion, StructuredExam } from "./examTypes";

const renders = new Map<string, number>();
vi.mock("./QuestionComposer", async () => {
  const actual = await vi.importActual<typeof import("./QuestionComposer")>("./QuestionComposer");
  const Real = actual.default;
  return { default: (props: { question: BuilderQuestion }) => { renders.set(props.question.examQuestionId, (renders.get(props.question.examQuestionId) ?? 0) + 1); return <Real {...(props as Parameters<typeof Real>[0])} />; } };
});
// One StimulusEditor per section header: its render count is the section editor's.
const sectionRenders = { count: 0 };
vi.mock("./StimulusEditor", async () => {
  const actual = await vi.importActual<typeof import("./StimulusEditor")>("./StimulusEditor");
  const Real = actual.default;
  return { default: (props: Parameters<typeof Real>[0]) => { sectionRenders.count += 1; return <Real {...props} />; } };
});
const { default: StructuredExamBuilder } = await import("./StructuredExamBuilder");
const { useStructuredExamHistory } = await import("./useStructuredExamHistory");

const N = 24;
const exam = (): StructuredExam => ({ examId: "E-ISO", title: "عزل الرسم", status: "draft", sections: [0, 1, 2].map(s => ({ id: "s" + s, title: "القسم " + (s + 1), gradingPolicy: "all", stimuli: {},
  // q2-4 starts WITHOUT a prompt: it carries an EMPTY_TEXT error from the start, so its issue array exists on every render (the
  // stabilized arrays must keep it from re-rendering when another question changes).
  questions: Array.from({ length: N / 3 }, (_, i) => ({ examQuestionId: "q" + s + "-" + i, presentationType: i % 2 ? "trueFalse" : "shortAnswer", text: s === 2 && i === 4 ? "" : "السؤال " + (s * 8 + i + 1), marks: 1, answer: i % 2 ? { correct: true } : { text: "x" } })) })) } as unknown as StructuredExam);

const hist: { current: ReturnType<typeof useStructuredExamHistory> | null } = { current: null };
function Host() {
  const h = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; h.open(exam(), "saved"); } }, [h]);
  useEffect(() => { hist.current = h; });
  if (!h.present) return null;
  return <StructuredExamBuilder exam={h.present} onChange={h.update} onTypingEnd={h.endTyping} onUndo={h.undo} onRedo={h.redo} canUndo={h.canUndo} canRedo={h.canRedo} />;
}
afterEach(() => { cleanup(); renders.clear(); sectionRenders.count = 0; });

const prompt = (id: string) => document.querySelector<HTMLTextAreaElement>("#sb-q-" + id + " textarea")!;

describe("21F.1 render isolation — one edited question, one re-rendered editor", () => {
  it("typing into one question re-renders only that question's editor", async () => {
    render(<Host />);
    await screen.findByDisplayValue("السؤال 1");
    expect(renders.size).toBe(N);
    const before = new Map(renders);
    const sectionsBefore = sectionRenders.count;
    await act(async () => { for (const text of ["السؤال 9 أ", "السؤال 9 أب", "السؤال 9 أبج"]) fireEvent.change(prompt("q1-0"), { target: { value: text } }); });
    expect(prompt("q1-0").value).toBe("السؤال 9 أبج");
    const changed = [...renders].filter(([id, n]) => n !== before.get(id)).map(([id]) => id);
    expect(changed).toEqual(["q1-0"]);
    // Only the edited question's section re-renders its header (once per keystroke); the other two sections are skipped.
    expect(sectionRenders.count - sectionsBefore).toBe(3);
  });
  it("an edit that changes another card's data (its issues) re-renders that card too — memo never hides a real change", async () => {
    render(<Host />);
    await screen.findByDisplayValue("السؤال 1");
    const before = new Map(renders);
    await act(async () => { fireEvent.change(prompt("q0-2"), { target: { value: "" } }); });       // q0-2 now has an EMPTY_TEXT error
    expect(document.querySelector("#sb-q-q0-2 .sb-inline-issues")).not.toBeNull();
    const changed = [...renders].filter(([id, n]) => n !== before.get(id)).map(([id]) => id);
    expect(changed).toEqual(["q0-2"]);
  });
  it("a card that already shows an issue is not re-rendered by another question's edit", async () => {
    render(<Host />);
    await screen.findByDisplayValue("السؤال 1");
    expect(document.querySelector("#sb-q-q2-4 .sb-inline-issues")).not.toBeNull();
    const before = new Map(renders);
    await act(async () => { fireEvent.change(prompt("q0-0"), { target: { value: "السؤال 1 معدّل" } }); });
    expect([...renders].filter(([id, n]) => n !== before.get(id)).map(([id]) => id)).toEqual(["q0-0"]);
  });
  it("a card's callbacks act on the LATEST question: the student preview after an edit shows the edited text", async () => {
    render(<Host />);
    await screen.findByDisplayValue("السؤال 1");
    await act(async () => { fireEvent.change(prompt("q0-0"), { target: { value: "نص بعد التعديل" } }); });
    await act(async () => { fireEvent.click(document.querySelector<HTMLButtonElement>('#sb-q-q0-0 button[aria-label="معاينة الطالب"]')!); });
    // The preview is portaled to <body>, outside the builder: its text is what the card's onPreview handed it.
    const previewText = Array.from(document.body.children).filter(el => !el.contains(prompt("q0-0"))).map(el => el.textContent || "").join(" ");
    expect(previewText).toContain("نص بعد التعديل");
    expect(previewText).not.toContain("السؤال 1 ");
  });
  it("callbacks stay current: undo after editing card A and moving card B applies to the right questions", async () => {
    render(<Host />);
    await screen.findByDisplayValue("السؤال 1");
    await act(async () => { fireEvent.change(prompt("q2-0"), { target: { value: "نص جديد" } }); });
    const down = document.querySelector<HTMLButtonElement>('#sb-q-q2-0 button[aria-label^="نقل السؤال"][aria-label$="للأسفل"]')!;
    await act(async () => { fireEvent.click(down); });
    const order = () => hist.current!.present!.sections[2].questions.map(q => q.examQuestionId);
    expect(order().slice(0, 2)).toEqual(["q2-1", "q2-0"]);
    await act(async () => { fireEvent.change(prompt("q2-0"), { target: { value: "نص أحدث" } }); });
    expect(hist.current!.present!.sections[2].questions[1].text).toBe("نص أحدث");
  });
});
