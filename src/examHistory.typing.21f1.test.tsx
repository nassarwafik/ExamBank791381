// @vitest-environment happy-dom
//
// Phase 21F.1 — typing coalescing: consecutive KEYBOARD keystrokes in one text field are one undo step; everything else (a paste, a
// button, a structural edit, another field, a pause, a save) still makes its own step. Pure history rules + the real builder wiring
// (native `beforeinput` marks the edit, focus leaving the field ends the group).
import { describe, it, expect, afterEach } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { openExamHistory, updateExamHistory, undoExamHistory, redoExamHistory, commitSavedExamHistory, closeTypingGroup, typingPathOf, TYPING_COALESCE_MS, type ExamHistory } from "./examHistory";
import type { StructuredExam } from "./examTypes";

const exam = (): StructuredExam => ({ examId: "E1", title: "", status: "draft", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", stimuli: {}, questions: [
  { examQuestionId: "qA", presentationType: "shortAnswer", text: "", marks: 2, answer: { text: "x" } },
  { examQuestionId: "qB", presentationType: "shortAnswer", text: "", marks: 2, answer: { text: "y" } }] }] } as unknown as StructuredExam);
const setText = (id: string, text: string) => (p: StructuredExam): StructuredExam => ({ ...p, sections: p.sections.map(s => ({ ...s, questions: s.questions.map(q => (q.examQuestionId === id ? { ...q, text } : q)) })) });
const typeInto = (h0: ExamHistory, id: string, word: string, t0: number, step = 100, from = "") => {
  let h = h0, t = t0, acc = from;
  for (const ch of word) { acc += ch; t += step; h = updateExamHistory(h, setText(id, acc), { typing: true, now: t }); }
  return { h, t };
};
const textOf = (h: ExamHistory, id: string) => h.present!.sections[0].questions.find(q => q.examQuestionId === id)!.text;

afterEach(() => cleanup());

describe("21F.1 typingPathOf — the one text value an edit changed", () => {
  it("names the path of a single text change, null for anything else", () => {
    const a = exam();
    expect(typingPathOf(a, setText("qA", "س")(a))).toBe("/sections/0/questions/0/text");
    expect(typingPathOf(a, { ...a, title: "عنوان" })).toBe("/title");
    expect(typingPathOf(a, setText("qB", "ب")(setText("qA", "أ")(a)))).toBeNull();
    expect(typingPathOf(a, { ...a, sections: a.sections.map(s => ({ ...s, questions: s.questions.map(q => ({ ...q, marks: 3 })) })) })).toBeNull();
    // ONE number changed (a marks field typed into) is not text: never coalesced.
    expect(typingPathOf(a, { ...a, sections: a.sections.map(s => ({ ...s, questions: s.questions.map((q, i) => (i === 0 ? { ...q, marks: 5 } : q)) })) })).toBeNull();
    expect(typingPathOf(a, { ...a, sections: [{ ...a.sections[0], instructions: undefined }] })).toBeNull();
    expect(typingPathOf(a, { ...a, sections: [{ ...a.sections[0], questions: a.sections[0].questions.slice(1) }] })).toBeNull();
  });
});

describe("21F.1 updateExamHistory — keyboard typing in one field is one undo step", () => {
  it("a typed word is ONE step: undo restores the text before the word", () => {
    const { h } = typeInto(openExamHistory(exam(), "saved"), "qA", "شبكة", 1000);
    expect(textOf(h, "qA")).toBe("شبكة");
    expect(h.past).toHaveLength(1);
    expect(textOf(undoExamHistory(h), "qA")).toBe("");
  });
  it("another field, a pause longer than the window, or a non-typed edit starts a new step", () => {
    let { h, t } = typeInto(openExamHistory(exam(), "saved"), "qA", "أب", 0);
    ({ h, t } = typeInto(h, "qB", "جد", t));
    expect(h.past).toHaveLength(2);
    ({ h, t } = typeInto(h, "qB", "هـ", t + TYPING_COALESCE_MS + 1, 100, "جد"));
    expect(h.past).toHaveLength(3);
    h = updateExamHistory(h, setText("qB", "جدهـو"), { now: t + 10 });              // a paste / programmatic change: its own step
    expect(h.past).toHaveLength(4);
    h = updateExamHistory(h, setText("qB", "جدهـوز"));                              // no meta at all: the historical per-edit step
    expect(h.past).toHaveLength(5);
  });
  it("a structural change typed in the same task is never folded", () => {
    let { h, t } = typeInto(openExamHistory(exam(), "saved"), "qA", "أ", 0);
    h = updateExamHistory(h, p => ({ ...p, sections: [{ ...p.sections[0], questions: p.sections[0].questions.slice(0, 1) }] }), { typing: true, now: t + 1 });
    expect(h.past).toHaveLength(2);
  });
  it("the saved checkpoint is never folded into a group: undo reaches what the server holds", () => {
    let { h, t } = typeInto(openExamHistory(exam(), "saved"), "qA", "أب", 0);
    const snapshot = h.present!;
    h = commitSavedExamHistory(h, snapshot, snapshot, "E-2");
    expect(h.typing).toBeUndefined();
    ({ h, t } = typeInto(h, "qA", "ج", t, 100, "أب"));
    ({ h } = typeInto(h, "qA", "د", t, 100, "أبج"));
    expect(textOf(h, "qA")).toBe("أبجد");
    expect(textOf(undoExamHistory(h), "qA")).toBe("أب");
  });
  it("undo alone ends the group: typing after an undo is a new step", () => {
    let { h, t } = typeInto(openExamHistory(exam(), "saved"), "qA", "أب", 0);
    ({ h, t } = typeInto(h, "qB", "ج", t));
    h = undoExamHistory(h);
    expect(h.typing).toBeUndefined();
    ({ h } = typeInto(h, "qA", "د", t, 100, "أب"));
    expect(h.past).toHaveLength(2);
    expect(textOf(undoExamHistory(h), "qA")).toBe("أب");
  });
  it("undo / redo / closeTypingGroup end the group", () => {
    let { h, t } = typeInto(openExamHistory(exam(), "saved"), "qA", "أب", 0);
    h = redoExamHistory(undoExamHistory(h));
    expect(h.typing).toBeUndefined();
    ({ h, t } = typeInto(h, "qA", "ج", t, 100, "أب"));
    expect(h.past).toHaveLength(2);
    h = closeTypingGroup(h);
    ({ h } = typeInto(h, "qA", "د", t, 100, "أبج"));
    expect(h.past).toHaveLength(3);
  });
  it("an endless typing burst never grows the history", () => {
    const { h } = typeInto(openExamHistory(exam(), "saved"), "qA", "ا".repeat(500), 0, 50);
    expect(h.past).toHaveLength(1);
  });
});

// ── The real builder + the real history hook (the App.tsx wiring) ──
type Handles = { hist: ReturnType<typeof useStructuredExamHistory> | null };
const handles: Handles = { hist: null };
function Host() {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(exam(), "saved"); } }, [hist]);
  useEffect(() => { handles.hist = hist; });
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onTypingEnd={hist.endTyping} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} />;
}
const promptOf = (id: string) => document.querySelector<HTMLTextAreaElement>("#sb-q-" + id + " textarea")!;
const typeKey = (el: HTMLTextAreaElement, ch: string) => {
  el.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: ch, bubbles: true, cancelable: true }));
  fireEvent.change(el, { target: { value: el.value + ch } });
};

describe("21F.1 the builder marks keyboard typing (native beforeinput) and ends the group on blur", () => {
  it("typing a word is one undo step; a paste is its own step; leaving the field ends the group", async () => {
    render(<Host />);
    await screen.findAllByText(/السؤال|القسم/);
    const a = promptOf("qA");
    await act(async () => { a.focus(); for (const ch of "شبكة") typeKey(a, ch); });
    expect(handles.hist!.history.past).toHaveLength(1);

    await act(async () => {
      a.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertFromPaste", bubbles: true, cancelable: true }));
      fireEvent.change(a, { target: { value: a.value + " محلية" } });
    });
    expect(handles.hist!.history.past).toHaveLength(2);

    await act(async () => { for (const ch of "!") typeKey(a, ch); });
    expect(handles.hist!.history.past).toHaveLength(3);
    await act(async () => { fireEvent.focusOut(a); });
    await act(async () => { for (const ch of "؟") typeKey(a, ch); });
    expect(handles.hist!.history.past).toHaveLength(4);

    await act(async () => { handles.hist!.undo(); handles.hist!.undo(); handles.hist!.undo(); handles.hist!.undo(); });
    expect(promptOf("qA").value).toBe("");
  });
  it("a change without a keyboard beforeinput (programmatic / test fireEvent) keeps one step per edit", async () => {
    render(<Host />);
    await screen.findAllByText(/السؤال|القسم/);
    const b = promptOf("qB");
    await act(async () => { fireEvent.change(b, { target: { value: "أ" } }); fireEvent.change(b, { target: { value: "أب" } }); });
    expect(handles.hist!.history.past).toHaveLength(2);
  });
});
