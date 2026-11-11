// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import { validateStructuredExam } from "../examQuality";
import { editorQualityNotes } from "./qualityNotes";

// Phase 21W — the 21Q quality checks in the builder, for ANY exam: advisory notes in exam order, each opening its question; never
// merged into the structural issues (no count, no save or finalization effect); nothing is shown for an exam without notes.
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
async function waitFor(fn: () => boolean, label: string, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error("timed out waiting for " + label); await tick(20); }
}
const mcq = (id: string, text: string, options: string[], correct = 0) => newQuestion("multipleChoice", { examQuestionId: id, text, marks: 1, options: options.map(t => ({ text: t })), answer: { correctOptionIndex: correct } });
const LEAK = "يوزّع بروتوكول DHCP العناوين تلقائيًا، فأي بروتوكول يوزّعها؟";
const exam = (questions = [
  mcq("q1", "ما الجهاز الذي يربط الشبكات المختلفة؟", ["المبدّل", "الموجّه", "المكرّر"], 1),
  mcq("q2", LEAK, ["DHCP", "DNS", "FTP"]),
  mcq("q3", "كم بتًا في عنوان IPv4؟", ["64", "32", "128"], 1)
]): StructuredExam => ({ examId: "E21W", title: "امتحان يدوي", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] } as unknown as StructuredExam);

describe("21W-NOTES the advisory notes", () => {
  it("a hand-written exam gets the leak note on its question, numbered in exam order; an exam without notes gets none", () => {
    const notes = editorQualityNotes(exam());
    expect(notes.map(n => [n.code, n.questionId, n.number])).toEqual([["COMPOSER_ANSWER_LEAK", "q2", 2]]);
    expect(notes[0].message).toContain("«DHCP»");
    expect(editorQualityNotes(exam([mcq("q1", "ما الجهاز الذي يربط الشبكات المختلفة؟", ["المبدّل", "الموجّه"], 1)]))).toEqual([]);
    expect(editorQualityNotes({ ...exam(), sections: [] })).toEqual([]);
  });
  it("notes are sorted by question number, and identical notes appear once", () => {
    const dup = "ما وظيفة الشبكة المحلية الافتراضية VLAN في تقسيم الشبكة؟";
    const notes = editorQualityNotes(exam([mcq("a", dup, ["تقسيم", "تسريع"]), mcq("b", LEAK, ["DHCP", "DNS", "FTP"]), mcq("c", dup.replace("الشبكة؟", "الشبكات؟"), ["تقسيم", "تسريع"])]));
    expect(notes.map(n => n.number)).toEqual([...notes.map(n => n.number)].sort((x, y) => (x ?? 99) - (y ?? 99)));
    expect(new Set(notes.map(n => n.key)).size).toBe(notes.length);
    expect(notes.some(n => n.code === "COMPOSER_ANSWER_LEAK" && n.questionId === "b")).toBe(true);
    expect(notes.some(n => n.code === "COMPOSER_NEAR_DUPLICATE_STEM")).toBe(true);
  });
  it("the notes are not structural issues: the exam's own validation is unchanged by them", () => {
    expect(validateStructuredExam(exam()).filter(i => i.severity === "error")).toEqual([]);
    expect(validateStructuredExam(exam()).some(i => /DHCP/.test(i.message))).toBe(false);
  });
});

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ start, layout }: { start: StructuredExam; layout?: "classic" | "studio" }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(start, "saved"); } }, [hist, start]);
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} layout={layout} />;
}
const card = (id: string) => document.querySelector<HTMLElement>('.sb-question[data-question-id="' + id + '"], .st-card[data-question-id="' + id + '"]');
const notesBox = () => screen.queryByTestId("builder-quality-notes");

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("21W-UI the builder shows the notes, separate from the issues", () => {
  it("classic: a collapsed «ملاحظات الجودة (1)», no issue summary (nothing structural); the note opens and focuses question 2", async () => {
    render(<Host start={exam()} />);
    await waitFor(() => !!notesBox(), "the quality notes");
    const box = notesBox()!;
    const head = within(box).getByRole("button", { name: /ملاحظات الجودة \(1\)/ });
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".sb-issues-summary")).toBeNull();                    // not merged into the structural issues
    fireEvent.click(head);
    const link = within(within(box).getByRole("list", { name: "ملاحظات الجودة" })).getByRole("button", { name: /«DHCP».*السؤال 2/ });
    fireEvent.click(link);
    await waitFor(() => document.activeElement === card("q2"), "question 2 focused");
  });

  it("an exam without notes shows nothing; fixing the leak removes the block", async () => {
    let hist!: Hist;
    function Probe() { const h = useStructuredExamHistory(); hist = h; const b = useRef(false); useEffect(() => { if (!b.current) { b.current = true; h.open(exam(), "saved"); } }, [h]); return h.present ? <StructuredExamBuilder exam={h.present} onChange={h.update} onSave={() => {}} saving={false} onUndo={h.undo} onRedo={h.redo} canUndo={h.canUndo} canRedo={h.canRedo} saveState={examSaveState(h.history, false)} backupStorage={null} /> : null; }
    render(<Probe />);
    await waitFor(() => !!notesBox(), "the quality notes");
    act(() => hist.update(prev => ({ ...prev, sections: prev.sections.map(s => ({ ...s, questions: s.questions.map(q => (q.examQuestionId === "q2" ? { ...q, text: "أي بروتوكول يوزّع العناوين تلقائيًا؟" } : q)) })) })));
    await waitFor(() => !notesBox(), "the notes gone");
  });

  it("Studio: the review step lists the notes; a note opens the question as the active card of the content step", async () => {
    render(<Host start={exam()} layout="studio" />);
    const steps = await screen.findByRole("navigation", { name: "خطوات العمل" }, { timeout: 5000 });
    fireEvent.click(within(steps).getByRole("button", { name: /المراجعة/ }));
    await waitFor(() => !!notesBox(), "the review notes", 5000);
    fireEvent.click(within(notesBox()!).getByRole("button", { name: /ملاحظات الجودة/ }));
    fireEvent.click(within(notesBox()!).getByRole("button", { name: /السؤال 2/ }));
    await waitFor(() => document.activeElement === card("q2"), "the studio card focused", 5000);
    expect(card("q2")!.getAttribute("data-active")).toBe("true");
  });
});
