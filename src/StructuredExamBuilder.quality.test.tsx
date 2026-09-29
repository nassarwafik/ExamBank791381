// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within, waitFor } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam, BuilderQuestion, BuilderSection } from "./examTypes";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import { networkingBlueprint } from "./assessmentBlueprintFixtures";

// Phase 13C-C — F5 policy editor, F6 readiness panel, F7 blocking final save (handler re-check), F10 history, through the
// REAL StructuredExamBuilder + REAL 13A history hook. Fail-first on bd10c72.
const mcq = (id: string, text: string, over: Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...over } as BuilderQuestion);
const BP = (policy?: unknown): AssessmentBlueprintV1 => ({ ...networkingBlueprint, targets: { totalQuestions: 2 }, constraints: [
  { id: "ipv4", dimension: "topic", ref: "IP_ADDRESSING", metric: "marks", unit: "percent", min: 30 },
  { id: "osi", dimension: "topic", ref: "OSI_TCPIP", metric: "count", unit: "absolute", max: 5 }
], ...(policy ? { qualityPolicy: policy as never } : {}) });
const BLOCK = { schemaVersion: 1, enabled: true, rules: [{ id: "gate-ipv4", enabled: true, source: { kind: "constraint", constraintId: "ipv4" }, relations: ["below-min"], effect: "block-finalization" }] };
const WARN = { ...BLOCK, rules: [{ ...BLOCK.rules[0], effect: "warning" }] };
// q1 IP 2 marks, q2 OSI 6 marks → ipv4 = 25% (below-min 30)
const makeExam = (blueprint?: AssessmentBlueprintV1, over: Partial<StructuredExam> = {}): StructuredExam => ({
  examId: "ex1", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z", ...(blueprint ? { blueprint } : {}),
  sections: [{ id: "s1", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", "ما هو الراوتر", { assessmentMeta: { primaryTopicId: "IP_ADDRESSING" } }), mcq("q2", "طبقات OSI", { marks: 6, assessmentMeta: { primaryTopicId: "OSI_TCPIP" } })] }], ...over
} as StructuredExam);
type Handles = { latest: StructuredExam | null; dirty: boolean; pastLength: number; undo: () => void; redo: () => void; update: (u: (e: StructuredExam) => StructuredExam) => void; updateCalls: number };
const h = {} as Handles;
function Host({ initial, onSave }: { initial?: StructuredExam; onSave?: (mode: "draft" | "final") => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial ?? makeExam(), "saved"); } }, [hist, initial]);
  useEffect(() => { Object.assign(h, { latest: hist.present, dirty: hist.dirty, pastLength: hist.history.past.length, undo: hist.undo, redo: hist.redo, update: hist.update }); }, [hist]);
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={u => { h.updateCalls += 1; hist.update(u); }} onSave={onSave ?? (() => {})} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo}
    saveState={examSaveState(hist.history, saving)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} />;
}
const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const policyBtn = () => screen.getByRole("button", { name: /سياسات الجودة/ });
const openPolicy = async () => { fireEvent.click(policyBtn()); return await screen.findByRole("dialog", { name: "سياسات الجودة" }); };
const gatesBtn = () => screen.queryByRole("button", { name: /بوابات الجودة/ });
const openReadiness = async () => { fireEvent.click(gatesBtn()!); return await screen.findByRole("dialog", { name: "فحص الجاهزية للاعتماد" }); };
const finalBtn = () => screen.getByRole("button", { name: /اعتماد نهائي/ }) as HTMLButtonElement;
const draftBtn = () => screen.getByRole("button", { name: /حفظ مسودة/ }) as HTMLButtonElement;
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const cardCheckbox = (id: string) => within(card(id)).getByRole("checkbox", { name: "تحديد السؤال" }) as HTMLInputElement;
const policy = () => h.latest!.blueprint!.qualityPolicy!;
const ruleCard = (dialog: HTMLElement, id: string) => dialog.querySelector(`[data-rule-id="${id}"]`) as HTMLElement;
const closeDialog = async (d: HTMLElement) => { fireEvent.click(within(d).getByRole("button", { name: "إغلاق" })); await tick(); };

beforeEach(() => { window.confirm = vi.fn(() => true); h.updateCalls = 0; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("F5 — سياسات الجودة: authoring the policy through the history authority", () => {
  it("open → no history; enable policy = one step; add rule = one step (constraint source, relations, effect); same-value edit = no history; undo / redo restore the policy; invalid relation set is reported", async () => {
    render(<Host initial={makeExam(BP())} />); await tick();
    expect(gatesBtn()).toBeNull();                                                                    // no policy yet → no gate status
    const dialog = await openPolicy();
    expect(h.pastLength).toBe(0); expect(h.dirty).toBe(false);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "تفعيل سياسات الجودة" }));
    expect(policy()).toEqual({ schemaVersion: 1, enabled: true, rules: [] }); expect(h.pastLength).toBe(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة قاعدة" }));
    expect(policy().rules).toHaveLength(1); expect(h.pastLength).toBe(2);
    const id = policy().rules[0].id; const rc = () => ruleCard(dialog, id);
    fireEvent.change(within(rc()).getByRole("combobox", { name: "مصدر القاعدة" }), { target: { value: "constraint:ipv4" } });
    expect(policy().rules[0].source).toEqual({ kind: "constraint", constraintId: "ipv4" });
    expect(rc().textContent).toMatch(/عنونة IPv4/);                                                    // human label shown, id stored
    fireEvent.change(within(rc()).getByRole("combobox", { name: "الأثر" }), { target: { value: "block-finalization" } });
    expect(policy().rules[0].effect).toBe("block-finalization");
    const steps = h.pastLength;
    fireEvent.change(within(rc()).getByRole("combobox", { name: "الأثر" }), { target: { value: "block-finalization" } });   // same value
    expect(h.pastLength).toBe(steps);
    // relations: uncheck everything → EMPTY_RELATIONS surfaced; check below-min → valid
    const rel = (name: string) => within(rc()).getByRole("checkbox", { name }) as HTMLInputElement;
    for (const cb of within(rc()).getAllByRole("checkbox") as HTMLInputElement[]) if (cb.checked && cb !== within(rc()).getByRole("checkbox", { name: "القاعدة مفعّلة" })) fireEvent.click(cb);
    expect((policy().rules[0] as { relations?: string[] }).relations).toEqual([]);
    expect(within(dialog).getByRole("list", { name: "مشكلات السياسة" }).querySelector('[data-code="EMPTY_RELATIONS"]')).toBeTruthy();
    fireEvent.click(rel("أقل من الحد الأدنى"));
    expect((policy().rules[0] as { relations?: string[] }).relations).toEqual(["below-min"]); expect(within(dialog).queryByRole("list", { name: "مشكلات السياسة" })).toBeNull();
    fireEvent.change(within(rc()).getByRole("textbox", { name: "ملاحظة" }), { target: { value: "تغطية IPv4 إلزامية" } });
    expect(policy().rules[0].note).toBe("تغطية IPv4 إلزامية");
    const total = h.pastLength;
    act(() => h.undo()); expect(policy().rules[0].note).toBeUndefined();
    act(() => h.redo()); expect(policy().rules[0].note).toBe("تغطية IPv4 إلزامية"); expect(h.pastLength).toBe(total);
    for (let i = 0; i < total; i++) act(() => h.undo());
    expect(h.latest!.blueprint!.qualityPolicy).toBeUndefined(); expect(h.dirty).toBe(false);
    expect(JSON.stringify(h.latest)).not.toMatch(/canFinalize|blockerCount|qualityReport/);
  });
  it("threshold rules (unclassified / unmapped) edit metric and max; remove rule; disable rule; the constraint select lists labels for every constraint", async () => {
    render(<Host initial={makeExam(BP({ schemaVersion: 1, enabled: true, rules: [] }))} />); await tick();
    const dialog = await openPolicy();
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة قاعدة" }));
    const id = policy().rules[0].id; const rc = () => ruleCard(dialog, id);
    fireEvent.change(within(rc()).getByRole("combobox", { name: "مصدر القاعدة" }), { target: { value: "unclassified" } });
    expect(policy().rules[0]).toMatchObject({ source: { kind: "unclassified" }, metric: "count", max: 0 });
    fireEvent.change(within(rc()).getByRole("spinbutton", { name: "الحد الأقصى" }), { target: { value: "2" } });
    fireEvent.change(within(rc()).getByRole("combobox", { name: "المقياس" }), { target: { value: "officialMarks" } });
    expect(policy().rules[0]).toMatchObject({ metric: "officialMarks", max: 2 });
    fireEvent.click(within(rc()).getByRole("checkbox", { name: "القاعدة مفعّلة" }));
    expect(policy().rules[0].enabled).toBe(false);
    const opts = Array.from((within(rc()).getByRole("combobox", { name: "مصدر القاعدة" }) as HTMLSelectElement).options).map(o => o.value);
    expect(opts).toEqual(expect.arrayContaining(["constraint:ipv4", "constraint:osi", "total-questions", "total-marks", "unclassified", "unmapped-bank"]));
    fireEvent.click(within(rc()).getByRole("button", { name: "حذف القاعدة" }));
    expect(policy().rules).toEqual([]);
  });
});

describe("F6 — بوابات الجودة status + فحص الجاهزية للاعتماد, live", () => {
  it("status text (not colour) reflects blockers / warnings; the panel separates أخطاء بنيوية / بوابات الجودة / تنبيهات; live on marks, classification, section cap, blueprint target, undo, redo", async () => {
    render(<Host initial={makeExam(BP(BLOCK))} />); await tick();
    expect(gatesBtn()!.textContent).toMatch(/بوابات الجودة: 1 حاجب/);
    let dialog = await openReadiness();
    expect(within(dialog).getByRole("heading", { name: "أخطاء بنيوية" })).toBeTruthy(); expect(within(dialog).getByRole("heading", { name: "بوابات الجودة" })).toBeTruthy(); expect(within(dialog).getByRole("heading", { name: "تنبيهات" })).toBeTruthy();
    const gate = dialog.querySelector('[data-gate-rule="gate-ipv4"]') as HTMLElement;
    expect(gate.textContent).toMatch(/عنونة IPv4/); expect(gate.textContent).toMatch(/25%/); expect(gate.textContent).toMatch(/تمنع الاعتماد/); expect(gate.textContent).toMatch(/أقل من الحد الأدنى/);
    expect(within(gate).getByRole("button", { name: "عرض الأسئلة" })).toBeTruthy();
    await closeDialog(dialog);
    // marks: q1 2 → 6 → 50% → gate clears
    fireEvent.change(within(card("q1")).getByRole("spinbutton", { name: "العلامة" }), { target: { value: "6" } });
    expect(gatesBtn()!.textContent).toMatch(/لا توجد موانع/);
    act(() => h.undo()); expect(gatesBtn()!.textContent).toMatch(/1 حاجب/);
    act(() => h.redo()); expect(gatesBtn()!.textContent).toMatch(/لا توجد موانع/);
    act(() => h.undo());
    // classification: q2 → IP_ADDRESSING → 100% → clears
    fireEvent.change(within(card("q2")).getByRole("combobox", { name: "الموضوع الرئيسي" }), { target: { value: "IP_ADDRESSING" } });
    expect(gatesBtn()!.textContent).toMatch(/لا توجد موانع/);
    act(() => h.undo());
    // section cap: capScore maxMarks 4 → q1 official 1, q2 3 → still 25%; then blueprint min 20 → within-range → clears
    act(() => h.update(prev => ({ ...prev, sections: prev.sections.map(s => ({ ...s, gradingPolicy: "capScore", maxMarks: 4 } as BuilderSection)) })));
    expect(gatesBtn()!.textContent).toMatch(/1 حاجب/);
    act(() => h.update(prev => ({ ...prev, blueprint: { ...prev.blueprint!, constraints: prev.blueprint!.constraints.map(c => (c.id === "ipv4" ? { ...c, min: 20 } : c)) } })));
    expect(gatesBtn()!.textContent).toMatch(/لا توجد موانع/);
    act(() => h.undo()); expect(gatesBtn()!.textContent).toMatch(/1 حاجب/);
    // warning policy → "0 حاجب • 1 تنبيهات"
    act(() => h.update(prev => ({ ...prev, blueprint: { ...prev.blueprint!, qualityPolicy: WARN as never } })));
    expect(gatesBtn()!.textContent).toMatch(/0 حاجب • 1 تنبيهات/);
    dialog = await openReadiness();
    expect(within(dialog).getByRole("list", { name: "تنبيهات" }).querySelector('[data-gate-rule="gate-ipv4"]')).toBeTruthy();
  });
  it("deleting the referenced constraint breaks the policy (blocker, rule kept); undo restores; invalid policy never crashes; evidence reaches the existing navigator / selection", async () => {
    render(<Host initial={makeExam(BP(BLOCK))} />); await tick();
    act(() => h.update(prev => ({ ...prev, blueprint: { ...prev.blueprint!, constraints: prev.blueprint!.constraints.filter(c => c.id !== "ipv4") } })));
    expect(policy().rules).toHaveLength(1);
    expect(gatesBtn()!.textContent).toMatch(/1 حاجب/);
    let dialog = await openReadiness();
    expect(dialog.textContent).toMatch(/BROKEN_CONSTRAINT_REF/);
    await closeDialog(dialog);
    act(() => h.undo()); expect(gatesBtn()!.textContent).toMatch(/1 حاجب/);                            // constraint back → the real gate again
    dialog = await openReadiness(); expect(dialog.textContent).not.toMatch(/BROKEN_CONSTRAINT_REF/);
    fireEvent.click(within(dialog.querySelector('[data-gate-rule="gate-ipv4"]') as HTMLElement).getByRole("button", { name: "عرض الأسئلة" })); await tick(10);
    expect(screen.queryByRole("dialog", { name: "فحص الجاهزية للاعتماد" })).toBeNull();
    expect(cardCheckbox("q1").checked).toBe(true); expect(cardCheckbox("q2").checked).toBe(false);
    expect(screen.getByRole("complementary", { name: "مستكشف الأسئلة" })).toBeTruthy(); expect(document.activeElement).toBe(card("q1"));
    cleanup();
    render(<Host initial={makeExam(BP({ schemaVersion: 7 }))} />); await tick();
    expect(gatesBtn()!.textContent).toMatch(/1 حاجب/);
    dialog = await openReadiness(); expect(dialog.textContent).toMatch(/UNSUPPORTED_POLICY_SCHEMA/);
  });
});

describe("F7 — اعتماد نهائي consumes the canonical decision; draft is never blocked; the handler re-checks", () => {
  it("blocker → final disabled AND a forced click on the re-enabled button still refuses (opens the readiness panel); warning → allowed; draft always allowed", async () => {
    const onSave = vi.fn();
    render(<Host initial={makeExam(BP(BLOCK))} onSave={onSave} />); await tick();
    expect(finalBtn().getAttribute("aria-disabled")).toBe("true"); expect(finalBtn().disabled).toBe(false); expect(draftBtn().disabled).toBe(false);
    fireEvent.click(draftBtn()); expect(onSave).toHaveBeenCalledWith("draft");
    fireEvent.click(finalBtn()); await tick();                                                         // the button is reachable: the HANDLER refuses and explains
    expect(onSave).not.toHaveBeenCalledWith("final");
    expect(await screen.findByRole("dialog", { name: "فحص الجاهزية للاعتماد" })).toBeTruthy();
    cleanup();
    const onSave2 = vi.fn();
    render(<Host initial={makeExam(BP(WARN))} onSave={onSave2} />); await tick();
    expect(finalBtn().disabled).toBe(false); expect(finalBtn().getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(finalBtn()); expect(onSave2).toHaveBeenCalledWith("final");
  });
  it("structural errors still block exactly as before (no blueprint, no policy) and an exam without a blueprint shows no quality surfaces", async () => {
    const onSave = vi.fn();
    const broken = makeExam(); (broken.sections[0].questions[0] as unknown as Record<string, unknown>).answer = undefined;
    render(<Host initial={broken} onSave={onSave} />); await tick();
    expect(finalBtn().disabled).toBe(true); expect(gatesBtn()).toBeNull(); expect(screen.queryByRole("button", { name: /سياسات الجودة/ })).toBeNull();
    finalBtn().removeAttribute("disabled"); fireEvent.click(finalBtn()); await tick();
    expect(onSave).not.toHaveBeenCalledWith("final");
    cleanup();
    const ok = vi.fn();
    render(<Host initial={makeExam()} onSave={ok} />); await tick();
    expect(finalBtn().disabled).toBe(false); fireEvent.click(finalBtn()); expect(ok).toHaveBeenCalledWith("final");
  });
  it("accessibility: readiness dialog named, sections are headings, items carry effect + reason text, focus returns to the opener", async () => {
    render(<Host initial={makeExam(BP(BLOCK))} />); await tick();
    gatesBtn()!.focus();
    const dialog = await openReadiness();
    const item = dialog.querySelector('[data-gate-rule="gate-ipv4"]') as HTMLElement;
    expect(item.textContent).toMatch(/يمنع الاعتماد النهائي/); expect(item.textContent).toMatch(/الموجود/);
    await closeDialog(dialog);
    await waitFor(() => expect(document.activeElement).toBe(gatesBtn()));
  });
});
