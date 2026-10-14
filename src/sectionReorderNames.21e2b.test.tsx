// @vitest-environment happy-dom
// Phase 21E.2 part 2 (E) — the section reorder buttons say WHICH section they move («نقل القسم N للأعلى / للأسفل»), like the
// question reorder buttons part 1 named («نقل السؤال N …»). Before, every section's pair was the same «أعلى» / «أسفل», so a screen
// reader user heard four identical buttons on a two-section exam. Disabled states and the move itself are unchanged.
// Fail-first: on 27396fb the contextual names do not exist (getByRole throws).
import { describe, it, expect, afterEach } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam, BuilderQuestion } from "./examTypes";

afterEach(cleanup);
const mcq = (id: string): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks: 1, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } } as BuilderQuestion);
const exam = (): StructuredExam => ({ examId: "ex1", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [
    { id: "sA", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1")] },
    { id: "sB", title: "البروتوكولات", gradingPolicy: "all", stimuli: {}, questions: [mcq("q2")] },
  ] } as StructuredExam);
let latest: StructuredExam | null = null;
function Host() {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(exam(), "saved"); } }, [hist]);
  useEffect(() => { latest = hist.present; }, [hist.present]);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo}
    canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} />;
}
const tick = () => act(async () => { await new Promise(r => setTimeout(r, 5)); });
const btn = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("E — section reorder buttons name their section", () => {
  it("each section's pair names its position; the outer ends are disabled exactly as before", async () => {
    render(<Host />); await tick();
    expect(btn("نقل القسم 1 للأعلى").disabled).toBe(true);
    expect(btn("نقل القسم 1 للأسفل").disabled).toBe(false);
    expect(btn("نقل القسم 2 للأعلى").disabled).toBe(false);
    expect(btn("نقل القسم 2 للأسفل").disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "أعلى" })).toBeNull();                 // no anonymous section «أعلى» / «أسفل» left
    expect(screen.queryByRole("button", { name: "أسفل" })).toBeNull();
    expect(btn("نقل القسم 2 للأعلى").title).toBe("نقل القسم 2 للأعلى");                // pointer users read the same words
  });
  it("the move itself is unchanged: «نقل القسم 2 للأعلى» swaps the two sections; the names follow the new positions", async () => {
    render(<Host />); await tick();
    fireEvent.click(btn("نقل القسم 2 للأعلى")); await tick();
    expect(latest!.sections.map(s => s.id)).toEqual(["sB", "sA"]);
    expect(btn("نقل القسم 1 للأعلى").disabled).toBe(true);                             // the moved section is now section 1
    expect(btn("نقل القسم 2 للأسفل").disabled).toBe(true);
  });
});
