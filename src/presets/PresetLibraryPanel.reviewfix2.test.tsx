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

// Phase 15A — Independent Review Fix 2 (UI): a Blueprint whose constraints collection / targets are malformed while a Quality
// Policy is present must fail closed in the Save Design flow — structured Blueprint issues, no runtime text, zero API writes,
// no history mutation, save state unchanged. Fail-first on 3cb85cf (the policy validator threw after the Blueprint issue).
const mcq = (id: string, text: string): BuilderQuestion => ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } } as BuilderQuestion);
const blueprint = (): AssessmentBlueprintV1 => ({ schemaVersion: 1, subject: { id: "chemistry", label: "الكيمياء" }, course: { id: "CHM-1", label: "مقرر CHM-1" }, level: { id: "11", label: "ثاني ثانوي" },
  topics: [{ id: "t1", label: "الروابط" }], objectives: [{ id: "o1", label: "يوازن معادلة", topicId: "t1" }], targets: { totalQuestions: 20, totalMarks: 60 },
  constraints: [{ id: "c1", dimension: "topic", ref: "t1", metric: "count", unit: "absolute", min: 2 }, { id: "c2", dimension: "section", ref: "sec-cur-1", metric: "count", unit: "absolute", min: 1 }],
  qualityPolicy: { schemaVersion: 1, enabled: true, rules: [
    { id: "qr1", enabled: true, source: { kind: "constraint", constraintId: "c1" }, relations: ["below-min"], effect: "block-finalization" },
    { id: "qr2", enabled: true, source: { kind: "total-questions" }, relations: ["below-min"], effect: "warning" }
  ] } });
const makeExam = (patch: (bp: Record<string, unknown>) => void): StructuredExam => {
  const bp = blueprint() as unknown as Record<string, unknown>; patch(bp);
  return { examId: "EXAM-CURRENT", title: "امتحان الكيمياء الحالي", status: "draft", schemaVersion: 2, presentationTheme: "cards", blueprint: bp,
    sections: [{ id: "sec-cur-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", "ما هي الرابطة الأيونية"), mcq("q2", "الرابطة التساهمية")] }] } as unknown as StructuredExam;
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
const RUNTIME = /is not a function|Cannot read|Cannot use 'in'|undefined|null|TypeError/;

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function runSave(initial: StructuredExam) {
  const { svc, calls } = fakeService();
  let hist!: Hist;
  render(<Host svc={svc} initial={initial} onHistory={h => { hist = h; }} />);
  fireEvent.click(screen.getByRole("button", { name: /القوالب الأكاديمية/ }));
  const d = await screen.findByRole("dialog", { name: "القوالب الأكاديمية" }); await tick(30);
  fireEvent.click(within(d).getByRole("button", { name: "حفظ التصميم الحالي كقالب أكاديمي" }));
  const dlg = await screen.findByRole("dialog", { name: "حفظ التصميم الحالي كقالب أكاديمي" });
  fireEvent.click(within(dlg).getByTestId("ap-save-confirm"));
  await tick(30);
  return { d, calls, hist: () => hist };
}
function expectClosed(d: HTMLElement, calls: string[], hist: () => Hist) {
  const alert = within(d).getByRole("alert").textContent || "";
  expect(alert).toContain("لا يمكن حفظ تصميم غير صالح"); expect(alert).not.toMatch(RUNTIME);
  const list = within(d).getByRole("list", { name: "مشكلات التحقق" });
  expect(list.textContent).toMatch(/blueprint/); expect(list.textContent).not.toMatch(RUNTIME);
  expect(calls.filter(c => c !== "list")).toEqual([]);
  const h = hist();
  expect(h.present!.examId).toBe("EXAM-CURRENT"); expect(h.present!.sections[0].questions).toHaveLength(2);
  expect(h.canUndo).toBe(false); expect(h.canRedo).toBe(false); expect(examSaveState(h.history, false)).toBe("saved");
}

describe("15A Review Fix 2 — UI: malformed Blueprint substructure with a present Quality Policy", () => {
  it("constraints = {} (policy references a constraint): structured Blueprint issue, no runtime text, zero writes, no undo, save state saved", async () => {
    const { d, calls, hist } = await runSave(makeExam(bp => { bp.constraints = {}; }));
    expectClosed(d, calls, hist);
  });
  it("targets = 'broken' (policy has a total-questions rule): same fail-closed outcome", async () => {
    const { d, calls, hist } = await runSave(makeExam(bp => { bp.targets = "broken"; }));
    expectClosed(d, calls, hist);
  });
});
