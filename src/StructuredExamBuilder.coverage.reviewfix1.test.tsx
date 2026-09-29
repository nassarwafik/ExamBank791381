// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam, BuilderQuestion } from "./examTypes";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import { networkingBlueprint, physicsBlueprint, chemistryBlueprint, mathematicsBlueprint } from "./assessmentBlueprintFixtures";

// Phase 13C-B — Independent Review Fix 1 (builder surface): R1 guided bank discovery is scope-gated (data), the manual
// picker is not; R2 an invalid total target is shown as unassessable, never as an authoritative target. Fail-first on ffea5b0.
const mcq = (id: string, text: string, over: Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...over } as BuilderQuestion);
const withRows = (bp: AssessmentBlueprintV1, topic: string): AssessmentBlueprintV1 => ({ ...bp, targets: { totalQuestions: 6 }, constraints: [
  { id: "c-topic", dimension: "topic", ref: topic, metric: "count", unit: "absolute", target: 3 },
  { id: "c-diff", dimension: "difficulty", ref: "3", metric: "count", unit: "absolute", target: 2 },
  { id: "c-type", dimension: "questionType", ref: "multipleChoice", metric: "count", unit: "absolute", max: 1 }
] });
const makeExam = (blueprint: AssessmentBlueprintV1, topic: string): StructuredExam => ({
  examId: "ex1", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z", blueprint,
  sections: [{ id: "s1", title: "أ", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", "س1", { assessmentMeta: { primaryTopicId: topic, difficulty: 3 } }), mcq("q2", "س2")] }]
} as StructuredExam);
const bankRows = () => [{ id: "BANK-1", sourceId: "791381-2025", sourceKind: "official", official: true, questionNumber: "1", section: "BASIC", topic: "IP_ADDRESSING", difficulty: 3, difficultyLabel: "", type: "multipleChoice", presentationType: "multipleChoice", text: "ما هو IP؟", options: [{ value: "A", text: "x" }, { value: "B", text: "y" }], fields: [], wordBank: [], answer: { correctOptionValue: "A" }, hasImage: false, reviewStatus: "classified", createdAt: "", updatedAt: "" }];
const bankService = (scope?: { subjectId: string; courseId?: string; curriculumId?: string }) => ({ list: vi.fn(async () => bankRows()), select: vi.fn(async () => []), ...(scope ? { scope } : {}) });
type Handles = { latest: StructuredExam | null; pastLength: number };
const h = {} as Handles;
function Host({ initial, bank }: { initial: StructuredExam; bank?: ReturnType<typeof bankService> }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { Object.assign(h, { latest: hist.present, pastLength: hist.history.past.length }); }, [hist]);
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={u => hist.update(u)} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo}
    saveState={examSaveState(hist.history, saving)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} bankPicker={bank as never} />;
}
const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const openCov = async () => { fireEvent.click(screen.getByRole("button", { name: /تحليل المخطط/ })); return await screen.findByRole("dialog", { name: "تحليل المخطط الحي" }); };
const bankButtons = (dialog: HTMLElement) => within(dialog).queryAllByRole("button", { name: "ابحث في بنك الأسئلة" });
const NET_SCOPE = { subjectId: "networking", courseId: "791381" };

beforeEach(() => { window.confirm = vi.fn(() => true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("R1 — guided bank discovery is gated by the bank service's declared scope (data), the manual picker is not", () => {
  it("Physics (topic), Chemistry (difficulty) and Mathematics (type) blueprints get NO 'ابحث في بنك الأسئلة' against the networking / 791381 bank; the manual toolbar button stays", async () => {
    for (const [bp, topic] of [[physicsBlueprint, "MOTION"], [chemistryBlueprint, "REDOX"], [mathematicsBlueprint, "ALGEBRA"]] as const) {
      render(<Host initial={makeExam(withRows(bp, topic), topic)} bank={bankService(NET_SCOPE)} />); await tick();
      expect(screen.getByRole("button", { name: /إضافة من بنك الأسئلة/ })).toBeTruthy();
      const dialog = await openCov();
      expect(dialog.querySelectorAll("[data-coverage-id]")).toHaveLength(4);                          // the analysis itself is subject-neutral and complete
      expect(bankButtons(dialog)).toHaveLength(0);
      cleanup();
    }
  });
  it("an unscoped bank service permits no guided discovery even for the networking blueprint; a matching scope allows topic / difficulty / type focus", async () => {
    render(<Host initial={makeExam(withRows(networkingBlueprint, "IP_ADDRESSING"), "IP_ADDRESSING")} bank={bankService()} />); await tick();
    let dialog = await openCov();
    expect(bankButtons(dialog)).toHaveLength(0);
    expect(screen.getByRole("button", { name: /إضافة من بنك الأسئلة/ })).toBeTruthy();
    cleanup();
    render(<Host initial={makeExam(withRows(networkingBlueprint, "IP_ADDRESSING"), "IP_ADDRESSING")} bank={bankService(NET_SCOPE)} />); await tick();
    dialog = await openCov();
    expect(bankButtons(dialog)).toHaveLength(3);
    fireEvent.click(within(dialog.querySelector('[data-coverage-id="c-topic"]') as HTMLElement).getByRole("button", { name: "ابحث في بنك الأسئلة" }));
    const picker = await screen.findByRole("dialog", { name: "إضافة من بنك الأسئلة" }); await tick();
    expect((within(picker).getByLabelText("الموضوع") as HTMLSelectElement).value).toBe("IP_ADDRESSING");
    expect(h.pastLength).toBe(0);
  });
  it("a scope that matches the subject but declares another course blocks guided discovery", async () => {
    render(<Host initial={makeExam(withRows(networkingBlueprint, "IP_ADDRESSING"), "IP_ADDRESSING")} bank={bankService({ subjectId: "networking", courseId: "791367" })} />); await tick();
    const dialog = await openCov();
    expect(bankButtons(dialog)).toHaveLength(0);
  });
});

describe("R2 — an invalid total target is visible as unassessable, never as an authoritative target", () => {
  it("targets.totalQuestions = -1: overview shows the fact without a target, the total row is unassessable with INVALID_TARGET, and the badge / panel issue counts agree", async () => {
    const bp = { ...networkingBlueprint, constraints: [], targets: { totalQuestions: -1, totalMarks: 10 } };
    render(<Host initial={makeExam(bp, "IP_ADDRESSING")} bank={undefined} />); await tick();
    expect(screen.getByRole("button", { name: /مخطط الامتحان/ }).querySelector(".sb-bp-badge")?.textContent).toBe("1");
    const dialog = await openCov();
    expect((dialog.querySelector('[data-overview="questions"]') as HTMLElement).textContent!.replace(/\s+/g, " ").trim()).toBe("2 سؤال");
    expect((dialog.querySelector('[data-overview="marks"]') as HTMLElement).textContent!.replace(/\s+/g, " ").trim()).toBe("4 / 10 علامة");
    const row = dialog.querySelector('[data-coverage-id="total-questions"]') as HTMLElement;
    expect(row.getAttribute("data-relation")).toBe("unassessable");
    expect(row.textContent).toMatch(/INVALID_TARGET/); expect(row.textContent).not.toMatch(/-1/);
    expect((dialog.querySelector('[data-coverage-id="total-marks"]') as HTMLElement).getAttribute("data-relation")).toBe("below-target");
    expect(within(dialog).getByRole("note").textContent).toMatch(/1 مشكلة/);
  });
});
