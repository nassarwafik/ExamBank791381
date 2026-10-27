// @vitest-environment happy-dom
// D5 (item 9) — the builder's «المزيد» menu prints the exam that is open: «طباعة ورقة الامتحان (PDF)» (the student paper) and
// «طباعة مفتاح الإجابات (PDF)» (the teacher's key). Through the REAL StructuredExamBuilder + history hook; the print module is
// replaced by a spy (its document is tested in print/examPrint.d5.test.ts). A browser without an iframe print warns.
import { describe, it, expect, afterEach, vi } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";

const printExam = vi.fn((_exam: unknown, _mode: string) => true);
vi.mock("./print/examPrint", () => ({ printExam: (exam: unknown, mode: string) => printExam(exam, mode) }));

import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam, BuilderQuestion } from "./examTypes";
import { toolbarItem } from "./builder/toolbarTestActions";

afterEach(() => { cleanup(); printExam.mockClear(); });

const mcq = (id: string): BuilderQuestion => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } } as BuilderQuestion);
const makeExam = (): StructuredExam => ({ examId: "ex1", title: "امتحان الطباعة", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1"), mcq("q2")] }] } as StructuredExam);
function Host() {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(makeExam(), "saved"); } }, [hist]);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo}
    canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} onExit={() => {}} />;
}
const mount = async () => { render(<Host />); await act(async () => { await new Promise(r => setTimeout(r, 5)); }); };

describe("D5 — printing from the builder", () => {
  it("the student paper and the answer key are two items of «المزيد»; each prints the open exam in its mode", async () => {
    await mount();
    const paper = toolbarItem("طباعة ورقة الامتحان (PDF)");
    expect(paper.closest(".eb-menu-panel")).not.toBeNull();
    fireEvent.click(paper);
    expect(printExam).toHaveBeenLastCalledWith(expect.objectContaining({ examId: "ex1", title: "امتحان الطباعة" }), "student");
    fireEvent.click(toolbarItem("طباعة مفتاح الإجابات (PDF)"));
    expect(printExam).toHaveBeenLastCalledWith(expect.objectContaining({ examId: "ex1" }), "key");
    expect(printExam).toHaveBeenCalledTimes(2);
  });
  it("a browser that offers no print gets a warning instead of silence", async () => {
    printExam.mockReturnValueOnce(false);
    await mount();
    fireEvent.click(toolbarItem("طباعة ورقة الامتحان (PDF)"));
    expect(await screen.findByText("تعذّر فتح نافذة الطباعة في هذا المتصفح.")).toBeTruthy();
  });
});
