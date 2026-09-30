// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import type { AssessmentBlueprintV1 } from "../assessmentTypes";
import type { AssessmentPresetService } from "./assessmentPresetClient";

// Phase 15A — Independent Review Fix 1 (RF8): a malformed CURRENT design (imported / legacy data) opens the Save Design flow
// safely, shows structured validation issues in «مشكلات التحقق», never surfaces a runtime message, makes zero API calls and
// leaves history / save state untouched. Fail-first on 0bc6656 (copy-first extraction threw inside the save flow).
const mcq = (id: string, text: string): BuilderQuestion => ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } } as BuilderQuestion);
const blueprint = (sectionId: string): AssessmentBlueprintV1 => ({ schemaVersion: 1, subject: { id: "networking", label: "شبكات الحاسوب" }, course: { id: "791381", label: "مقرر 791381" }, level: { id: "12", label: "ثاني ثانوي" },
  topics: [{ id: "t1", label: "IPv4" }], objectives: [{ id: "o1", label: "يحسب شبكة فرعية", topicId: "t1" }], targets: { totalQuestions: 20, totalMarks: 60 },
  constraints: [{ id: "c1", dimension: "topic", ref: "t1", metric: "count", unit: "absolute", min: 2 }, { id: "c2", dimension: "section", ref: sectionId, metric: "count", unit: "absolute", min: 1 }],
  qualityPolicy: { schemaVersion: 1, enabled: true, rules: [{ id: "qr1", enabled: true, source: { kind: "constraint", constraintId: "c1" }, relations: ["below-min"], effect: "block-finalization" }] } });
// `questions: []` for the Blueprint-collection case: the Builder's own classification editor renders topics per question and is
// not part of this fix — the Save Design flow must still be safe on the design alone.
const makeExam = (patch: (bp: Record<string, unknown>) => void, questions: BuilderQuestion[] = [mcq("q1", "ما هو الراوتر"), mcq("q2", "طبقات OSI")]): StructuredExam => {
  const bp = blueprint("sec-cur-1") as unknown as Record<string, unknown>; patch(bp);
  return { examId: "EXAM-CURRENT", title: "امتحان الشبكات الحالي", status: "draft", schemaVersion: 2, presentationTheme: "cards", blueprint: bp,
    sections: [{ id: "sec-cur-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] } as unknown as StructuredExam;
};
function fakeService() {
  const calls: string[] = [];
  const svc: AssessmentPresetService = {
    list: vi.fn(async () => { calls.push("list"); return { items: [], nextCursor: null, total: 0 }; }),
    load: vi.fn(async () => { calls.push("load"); throw new Error("unexpected"); }),
    create: vi.fn(async () => { calls.push("create"); throw new Error("unexpected"); }),
    update: vi.fn(async () => { calls.push("update"); throw new Error("unexpected"); }),
    remove: vi.fn(async () => { calls.push("remove"); })
  };
  return { svc, calls };
}
type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ svc, initial, onHistory }: { svc: AssessmentPresetService; initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo}
    saveState={examSaveState(hist.history, saving)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} presets={svc} onOpenExamFromPreset={next => hist.open(next, "unsaved")} />;
}
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const RUNTIME = /is not a function|Cannot read|undefined|null|TypeError/;

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function runSave(initial: StructuredExam) {
  const { svc, calls } = fakeService();
  let hist!: Hist;
  render(<Host svc={svc} initial={initial} onHistory={h => { hist = h; }} />);
  fireEvent.click(screen.getByRole("button", { name: /القوالب الأكاديمية/ }));
  const d = await screen.findByRole("dialog", { name: "القوالب الأكاديمية" }); await tick(30);
  fireEvent.click(within(d).getByRole("button", { name: "حفظ التصميم الحالي كقالب أكاديمي" }));
  const dlg = await screen.findByRole("dialog", { name: "حفظ التصميم الحالي كقالب أكاديمي" });     // the flow opens safely
  fireEvent.click(within(dlg).getByTestId("ap-save-confirm"));
  await tick(30);
  return { d, calls, hist: () => hist };
}

describe("15A RF8 — malformed current design in the Save Design flow", () => {
  it("blueprint.topics = 'broken': structured Blueprint issue in «مشكلات التحقق», no runtime text, zero API writes, no undo entry, save state unchanged", async () => {
    const { d, calls, hist } = await runSave(makeExam(bp => { bp.topics = "broken"; bp.constraints = null; }, []));
    const alert = within(d).getByRole("alert").textContent || "";
    expect(alert).toContain("لا يمكن حفظ تصميم غير صالح"); expect(alert).not.toMatch(RUNTIME);
    const list = within(d).getByRole("list", { name: "مشكلات التحقق" });
    expect(list.textContent).not.toMatch(RUNTIME);
    expect(list.textContent).toMatch(/blueprint/);
    expect(calls.filter(c => c !== "list")).toEqual([]);
    const h = hist();
    expect(h.present!.examId).toBe("EXAM-CURRENT"); expect((h.present!.blueprint as unknown as { topics: unknown }).topics).toBe("broken");
    expect(h.canUndo).toBe(false); expect(h.canRedo).toBe(false); expect(examSaveState(h.history, false)).toBe("saved");
    expect(screen.queryByRole("dialog", { name: "حفظ التصميم الحالي كقالب أكاديمي" })).toBeNull();
  });
  it("qualityPolicy.rules = null: Quality Policy issue shown, no exception surfaced, no create call", async () => {
    const { d, calls, hist } = await runSave(makeExam(bp => { (bp.qualityPolicy as Record<string, unknown>).rules = null; }));
    const alert = within(d).getByRole("alert").textContent || "";
    expect(alert).toContain("لا يمكن حفظ تصميم غير صالح"); expect(alert).not.toMatch(RUNTIME);
    expect(within(d).getByRole("list", { name: "مشكلات التحقق" }).textContent).toMatch(/qualityPolicy/);
    expect(calls.filter(c => c !== "list")).toEqual([]);
    expect(hist().canUndo).toBe(false); expect(examSaveState(hist().history, false)).toBe("saved");
  });
  it("duplicate source section ids: refused with the source-identity issue; nothing sent", async () => {
    const dup = makeExam(() => {}); (dup.sections as unknown as unknown[]).push({ id: "sec-cur-1", title: "مكرر", gradingPolicy: "all", stimuli: {}, questions: [] });
    const { d, calls, hist } = await runSave(dup);
    expect(within(d).getByRole("alert").textContent).toContain("لا يمكن حفظ تصميم غير صالح");
    expect(within(d).getByRole("list", { name: "مشكلات التحقق" }).textContent).toMatch(/مكرر|sections/);
    expect(calls.filter(c => c !== "list")).toEqual([]);
    expect(hist().canUndo).toBe(false);
  });
});
