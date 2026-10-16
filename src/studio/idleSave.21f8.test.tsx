// @vitest-environment happy-dom
//
// Phase 21F.8 — the builder's idle signal for the owner's server autosave (REAL builder + history hook, a short delay): it fires once
// after the last edit, every edit restarts the wait, and it never fires while nothing is unsaved, while a save is in flight, or when
// the owner did not ask for it.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, screen, act } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam } from "../examTypes";

const exam = (): StructuredExam => ({ examId: "E-I", title: "خمول", status: "draft", sections: [{ id: "s1", title: "الأول", gradingPolicy: "all", stimuli: {}, questions: [{ examQuestionId: "q1", presentationType: "trueFalse", marks: 1, text: "عبارة", answer: { correct: true } }] }] } as unknown as StructuredExam);
const hist: { current: ReturnType<typeof useStructuredExamHistory> | null } = { current: null };
function Host({ onIdleSave, saving = false }: { onIdleSave?: () => void; saving?: boolean }) {
  const h = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; h.open(exam(), "saved"); } }, [h]);
  useEffect(() => { hist.current = h; });
  if (!h.present) return null;
  return <StructuredExamBuilder exam={h.present} onChange={h.update} layout="studio" saving={saving} saveState={examSaveState(h.history, saving)} onSave={() => {}} onIdleSave={onIdleSave} idleSaveDelayMs={60} />;
}
beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia; });
afterEach(() => cleanup());
const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const edit = (title: string) => act(() => { hist.current!.update(prev => ({ ...prev, title })); });
async function mount(props: Parameters<typeof Host>[0]) { const r = render(<Host {...props} />); await screen.findByRole("tree", { name: "الأقسام والأسئلة" }); return r; }

describe("21F.8 idle signal", () => {
  it("fires once, after the LAST edit has been idle for the delay", async () => {
    const onIdleSave = vi.fn();
    await mount({ onIdleSave });
    await wait(120);
    expect(onIdleSave).not.toHaveBeenCalled();                                   // nothing unsaved
    edit("أ"); await wait(30); edit("أب"); await wait(30); edit("أبج");
    await wait(30);
    expect(onIdleSave).not.toHaveBeenCalled();                                   // every edit restarted the wait
    await wait(80);
    expect(onIdleSave).toHaveBeenCalledTimes(1);
    await wait(120);
    expect(onIdleSave).toHaveBeenCalledTimes(1);
  });
  it("never fires while a save is in flight", async () => {
    const onIdleSave = vi.fn();
    await mount({ onIdleSave, saving: true });
    edit("أثناء الحفظ");
    await wait(150);
    expect(onIdleSave).not.toHaveBeenCalled();
  });
  it("an owner that does not ask for it gets nothing (the classic behaviour)", async () => {
    await mount({});
    edit("بلا حفظ تلقائي");
    await wait(150);
    expect(hist.current!.present!.title).toBe("بلا حفظ تلقائي");
  });
});
