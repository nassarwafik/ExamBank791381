// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within, waitFor } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam, BuilderQuestion } from "./examTypes";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import { networkingBlueprint } from "./assessmentBlueprintFixtures";

// Phase 13C-B — F5 (live intelligence surface), F6 (bulk classification), F7 (Blueprint → Bank focus) through the REAL
// StructuredExamBuilder + REAL 13A history hook. Fail-first on baseline e6affe0.

const mcq = (id: string, text: string, over: Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...over } as BuilderQuestion);
const BP: AssessmentBlueprintV1 = {
  ...networkingBlueprint,
  targets: { totalQuestions: 6, totalMarks: 30 },
  constraints: [
    { id: "c-ip", dimension: "topic", ref: "IP_ADDRESSING", metric: "marks", unit: "percent", target: 50 },
    { id: "c-osi", dimension: "topic", ref: "OSI_TCPIP", metric: "count", unit: "absolute", min: 1, max: 2 },
    { id: "c-d3", dimension: "difficulty", ref: "3", metric: "count", unit: "absolute", target: 2 },
    { id: "c-mcq", dimension: "questionType", ref: "multipleChoice", metric: "count", unit: "absolute", max: 2 },
    { id: "c-obj", dimension: "objective", ref: "obj-subnet", metric: "count", unit: "absolute", target: 1 },
    { id: "c-s2", dimension: "section", ref: "s2", metric: "count", unit: "absolute", target: 2 }
  ]
};
const makeExam = (over: Partial<StructuredExam> = {}): StructuredExam => ({
  examId: "ex1", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z", blueprint: BP,
  sections: [
    { id: "s1", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [
      mcq("q1", "ما هو الراوتر", { assessmentMeta: { primaryTopicId: "IP_ADDRESSING", difficulty: 3 } }),
      mcq("q2", "سؤال بنك", { origin: "bank", bankQuestionId: "BANK-3", topic: "VLAN_TRUNKING", difficulty: 4 }),
      mcq("q3", "طبقات OSI", { assessmentMeta: { primaryTopicId: "OSI_TCPIP", difficulty: 3 } })
    ] },
    { id: "s2", title: "الأمن", gradingPolicy: "all", stimuli: {}, questions: [mcq("q4", "جدار الحماية")] }
  ], ...over
} as StructuredExam);
// initial facts: 4 questions, 8 official marks; IP_ADDRESSING 2/8 = 25%; OSI count 1; difficulty 3 count 2; mcq 4; obj-subnet 0; s2 count 1; unclassified q2,q4; unmapped q2.

const bankRows = () => [
  { id: "BANK-1", sourceId: "791381-2025", sourceKind: "official", official: true, questionNumber: "1", section: "BASIC", topic: "IP_ADDRESSING", difficulty: 2, difficultyLabel: "", type: "multipleChoice", presentationType: "multipleChoice", text: "ما هو IP؟", options: [{ value: "A", text: "بروتوكول" }, { value: "B", text: "كابل" }], fields: [], wordBank: [], answer: { correctOptionValue: "A" }, hasImage: false, reviewStatus: "classified", createdAt: "", updatedAt: "" },
  { id: "BANK-2", sourceId: "791381-2025", sourceKind: "official", official: true, questionNumber: "2", section: "INFRASTRUCTURE", topic: "SUBNET_CIDR", difficulty: 3, difficultyLabel: "", type: "shortAnswer", presentationType: "open", text: "احسب القناع", options: [], fields: [], wordBank: [], answer: { values: ["x"] }, hasImage: false, reviewStatus: "classified", createdAt: "", updatedAt: "" },
  { id: "BANK-3", sourceId: "manual", sourceKind: "manual", official: false, questionNumber: "", section: "BASIC", topic: "VLAN_TRUNKING", difficulty: 4, difficultyLabel: "", type: "multipleChoice", presentationType: "multipleChoice", text: "VLAN", options: [{ value: "a", text: "x" }, { value: "b", text: "y" }], fields: [], wordBank: [], answer: { correctOptionValue: "a" }, hasImage: false, reviewStatus: "classified", createdAt: "", updatedAt: "" }
];
const bankService = () => ({ list: vi.fn(async () => bankRows()), select: vi.fn(async (ids: string[]) => ids.map(id => { const r = bankRows().find(x => x.id === id)!; return { examQuestionId: "", origin: "bank", bankQuestionId: id, sourceId: r.sourceId, topic: r.topic, secondaryTopics: [], difficulty: r.difficulty, presentationType: r.presentationType, text: r.text, options: r.options, fields: r.fields, answer: r.answer, marks: 0, image: { exists: false, visible: false, assets: [] } }; })) });

type Handles = { latest: StructuredExam | null; dirty: boolean; pastLength: number; undo: () => void; redo: () => void; updateCalls: number };
const h = {} as Handles;
function Host({ initial, bank }: { initial?: StructuredExam; bank?: ReturnType<typeof bankService> }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial ?? makeExam(), "saved"); } }, [hist, initial]);
  useEffect(() => { Object.assign(h, { latest: hist.present, dirty: hist.dirty, pastLength: hist.history.past.length, undo: hist.undo, redo: hist.redo }); }, [hist]);
  const [saving] = useState(false);
  if (!hist.present) return null;
  return (
    <StructuredExamBuilder exam={hist.present} onChange={u => { h.updateCalls += 1; hist.update(u); }} onSave={() => {}} saving={saving}
      onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)}
      backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} bankPicker={bank as never} />
  );
}
const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const covBtn = () => screen.getByRole("button", { name: /تحليل المخطط/ });
const openCov = async () => { fireEvent.click(covBtn()); return await screen.findByRole("dialog", { name: "تحليل المخطط الحي" }); };
const closeDialog = async (dialog: HTMLElement) => { fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" })); await tick(); };
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const cardCheckbox = (id: string) => within(card(id)).getByRole("checkbox", { name: "تحديد السؤال" }) as HTMLInputElement;
const rowOf = (dialog: HTMLElement, id: string) => dialog.querySelector(`[data-coverage-id="${id}"]`) as HTMLElement;
const overview = (dialog: HTMLElement, k: string) => (dialog.querySelector(`[data-overview="${k}"]`) as HTMLElement).textContent!.replace(/\s+/g, " ").trim();
const meta = (id: string) => (h.latest!.sections.flatMap(s => s.questions).find(q => q.examQuestionId === id) as BuilderQuestion & { assessmentMeta?: Record<string, unknown> }).assessmentMeta;
const bulkBar = () => screen.queryByRole("region", { name: "إجراءات الأسئلة المحددة" });
const openClassify = async () => { fireEvent.click(within(bulkBar()!).getByRole("button", { name: "تصنيف المحدد" })); return await screen.findByRole("dialog", { name: "تصنيف المحدد" }); };

beforeEach(() => { window.confirm = vi.fn(() => true); h.updateCalls = 0; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("F5 — تحليل المخطط الحي: live, factual, derived from the canonical exam", () => {
  it("opens as a lazy dialog with the overview (questions / official marks vs targets, unclassified, unmapped, constraints) and one row per constraint; open/close creates no history and no dirt", async () => {
    render(<Host />); await tick();
    const dialog = await openCov();
    expect(overview(dialog, "questions")).toBe("4 / 6 سؤال");
    expect(overview(dialog, "marks")).toBe("8 / 30 علامة");
    expect(overview(dialog, "unclassified")).toContain("2");
    expect(overview(dialog, "unmapped")).toContain("1");
    expect(overview(dialog, "constraints")).toContain("6");
    expect(dialog.querySelectorAll("[data-coverage-id]")).toHaveLength(8);                          // 2 totals + 6 constraints
    expect(rowOf(dialog, "c-ip").getAttribute("data-relation")).toBe("below-target");
    expect(rowOf(dialog, "c-ip").textContent).toMatch(/عنونة IPv4/); expect(rowOf(dialog, "c-ip").textContent).toMatch(/25%/); expect(rowOf(dialog, "c-ip").textContent).toMatch(/أقل من الهدف/); expect(rowOf(dialog, "c-ip").textContent).toMatch(/25 نقاط مئوية/);
    expect(rowOf(dialog, "c-osi").getAttribute("data-relation")).toBe("within-range"); expect(rowOf(dialog, "c-osi").textContent).toMatch(/ضمن النطاق/);
    expect(rowOf(dialog, "c-mcq").getAttribute("data-relation")).toBe("above-max"); expect(rowOf(dialog, "c-mcq").textContent).toMatch(/أعلى من الحد الأقصى/);
    expect(rowOf(dialog, "c-d3").getAttribute("data-relation")).toBe("at-target");
    expect(rowOf(dialog, "total-questions").textContent).toMatch(/4 \/ 6/);
    await closeDialog(dialog);
    expect(h.pastLength).toBe(0); expect(h.dirty).toBe(false); expect(h.updateCalls).toBe(0);
    expect(screen.queryByRole("dialog", { name: "تحليل المخطط الحي" })).toBeNull();
    fireEvent.click(covBtn()); await screen.findByRole("dialog", { name: "تحليل المخطط الحي" });
    expect(h.pastLength).toBe(0);
  });
  it("updates immediately: marks, classification, move, delete, duplicate, blueprint target, undo, redo", async () => {
    render(<Host />); await tick();
    const dialog = await openCov();
    // marks: q1 2 → 6 : IP_ADDRESSING 6/12 = 50% → at-target; total marks 12
    fireEvent.change(within(card("q1")).getByRole("spinbutton", { name: "العلامة" }), { target: { value: "6" } });
    expect(rowOf(dialog, "c-ip").getAttribute("data-relation")).toBe("at-target"); expect(overview(dialog, "marks")).toBe("12 / 30 علامة");
    // classification: q4 → OSI_TCPIP : OSI count 2 (within-range, max 2), unclassified 1
    fireEvent.change(within(card("q4")).getByRole("combobox", { name: "الموضوع الرئيسي" }), { target: { value: "OSI_TCPIP" } });
    expect(rowOf(dialog, "c-osi").textContent).toMatch(/2 أسئلة/); expect(rowOf(dialog, "c-osi").textContent).toMatch(/النطاق 1–2/); expect(overview(dialog, "unclassified")).toContain("1");
    // move q3 → s2 : section s2 count 2 → at-target
    expect(rowOf(dialog, "c-s2").getAttribute("data-relation")).toBe("below-target");
    fireEvent.change(within(card("q3")).getByRole("combobox", { name: "نقل إلى قسم" }), { target: { value: "s2" } });
    expect(rowOf(dialog, "c-s2").getAttribute("data-relation")).toBe("at-target");
    // delete q2 : questions 3, mcq count 3 (still above max 2), unmapped 0
    fireEvent.click(within(card("q2")).getByRole("button", { name: "حذف" })); await tick();
    expect(overview(dialog, "questions")).toBe("3 / 6 سؤال"); expect(overview(dialog, "unmapped")).toContain("0");
    // duplicate q1 : questions 4, IP marks 12/18
    fireEvent.click(within(card("q1")).getByRole("button", { name: "تكرار" }));
    expect(overview(dialog, "questions")).toBe("4 / 6 سؤال"); expect(rowOf(dialog, "c-ip").textContent).toMatch(/75%/);          // 12 of 16 official marks
    // blueprint target change through مخطط الامتحان: totalQuestions 6 → 4 → at-target
    await closeDialog(dialog);
    fireEvent.click(screen.getByRole("button", { name: /مخطط الامتحان/ }));
    const bpDialog = await screen.findByRole("dialog", { name: "مخطط الامتحان" });
    fireEvent.change(within(bpDialog).getByRole("spinbutton", { name: "إجمالي الأسئلة المستهدف" }), { target: { value: "4" } });
    await closeDialog(bpDialog);
    const again = await openCov();
    expect(rowOf(again, "total-questions").getAttribute("data-relation")).toBe("at-target");
    // undo the target change → below-target again; redo → at-target
    const steps = h.pastLength;
    act(() => h.undo()); expect(rowOf(again, "total-questions").getAttribute("data-relation")).toBe("below-target");
    act(() => h.redo()); expect(rowOf(again, "total-questions").getAttribute("data-relation")).toBe("at-target");
    expect(h.pastLength).toBe(steps);
    expect(JSON.stringify(h.latest)).not.toMatch(/coverage|relation|evidence|intelligence/);        // nothing analytical persisted
  });
  it("evidence: عرض الأسئلة selects the contributing questions (global order) and opens the navigator; unclassified has its own path", async () => {
    render(<Host />); await tick();
    const dialog = await openCov();
    expect(within(rowOf(dialog, "c-obj")).queryByRole("button", { name: "عرض الأسئلة" })).toBeNull();     // 0 contributing questions
    fireEvent.click(within(rowOf(dialog, "c-mcq")).getByRole("button", { name: "عرض الأسئلة" })); await tick(10);
    expect(screen.queryByRole("dialog", { name: "تحليل المخطط الحي" })).toBeNull();
    expect(["q1", "q2", "q3", "q4"].map(id => cardCheckbox(id).checked)).toEqual([true, true, true, true]);
    expect(screen.getByRole("complementary", { name: "مستكشف الأسئلة" })).toBeTruthy();
    expect(document.activeElement).toBe(card("q1"));
    const dialog2 = await openCov();
    fireEvent.click(within(dialog2.querySelector('[data-overview="unclassified"]') as HTMLElement).getByRole("button", { name: "عرض غير المصنفة" })); await tick(10);
    expect(["q1", "q2", "q3", "q4"].map(id => cardCheckbox(id).checked)).toEqual([false, true, false, true]);
    expect(bulkBar()).toBeTruthy();
    expect(within(card("q2")).getByRole("combobox", { name: "الموضوع الرئيسي" })).toBeTruthy();         // the teacher can classify right there
  });
  it("an exam without a blueprint stays normal (no analysis button); an invalid blueprint never crashes the panel", async () => {
    const { blueprint: _b, ...plain } = makeExam(); void _b;
    render(<Host initial={plain as StructuredExam} />); await tick();
    expect(screen.queryByRole("button", { name: /تحليل المخطط/ })).toBeNull();
    cleanup();
    render(<Host initial={makeExam({ blueprint: { ...BP, constraints: [{ id: "bad", dimension: "topic", ref: "NOPE", metric: "count", unit: "absolute", target: 1 }, ...BP.constraints] } })} />); await tick();
    const dialog = await openCov();
    expect(rowOf(dialog, "bad").getAttribute("data-relation")).toBe("unassessable");
    expect(rowOf(dialog, "bad").textContent).toMatch(/غير قابل للتقييم/); expect(rowOf(dialog, "bad").textContent).toMatch(/BROKEN_TOPIC_REF/);
    expect(rowOf(dialog, "c-ip").getAttribute("data-relation")).toBe("below-target");
  });
  it("accessibility: named dialog, list semantics, relation as text, progress with numeric text, keyboard-reachable actions, focus returns to the opener", async () => {
    render(<Host />); await tick();
    covBtn().focus();                                                                                 // keyboard user: the opener holds focus
    const dialog = await openCov();
    expect(within(dialog).getByRole("list", { name: "قيود المخطط" })).toBeTruthy();
    const bar = within(rowOf(dialog, "c-ip")).getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("25"); expect(bar.getAttribute("aria-valuetext")).toMatch(/25%/);
    expect(rowOf(dialog, "c-ip").querySelector(".sb-cov-relation")!.textContent).toMatch(/أقل من الهدف/);
    const btn = within(rowOf(dialog, "c-mcq")).getByRole("button", { name: "عرض الأسئلة" });
    btn.focus(); expect(document.activeElement).toBe(btn);
    await closeDialog(dialog);
    await waitFor(() => expect(document.activeElement).toBe(covBtn()));
  });
});

describe("F6 — تصنيف المحدد: bulk pedagogical classification through the existing selection", () => {
  it("sets primary topic / difficulty / cognitive level and adds an objective on N selected in ONE history step; untouched fields kept; undo / redo", async () => {
    render(<Host />); await tick();
    fireEvent.click(cardCheckbox("q1")); fireEvent.click(cardCheckbox("q2")); fireEvent.click(cardCheckbox("q4"));
    const dialog = await openClassify();
    fireEvent.change(within(dialog).getByRole("combobox", { name: "الموضوع الرئيسي" }), { target: { value: "SUBNET_CIDR" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "الصعوبة" }), { target: { value: "4" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "المستوى المعرفي" }), { target: { value: "apply" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "وضع الأهداف" }), { target: { value: "add" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "يحسب قناع الشبكة وعدد المضيفين" }));
    const before = h.pastLength; const calls = h.updateCalls;
    fireEvent.click(within(dialog).getByRole("button", { name: "تطبيق التصنيف" })); await tick();
    expect(h.pastLength).toBe(before + 1); expect(h.updateCalls).toBe(calls + 1);
    for (const id of ["q1", "q2", "q4"]) expect(meta(id)).toEqual({ primaryTopicId: "SUBNET_CIDR", difficulty: 4, cognitiveLevel: "apply", objectiveIds: ["obj-subnet"] });
    expect(meta("q3")).toEqual({ primaryTopicId: "OSI_TCPIP", difficulty: 3 });                        // not selected
    const q2 = h.latest!.sections[0].questions[1] as unknown as Record<string, unknown>;
    expect(q2.origin).toBe("bank"); expect(q2.bankQuestionId).toBe("BANK-3"); expect(q2.topic).toBe("VLAN_TRUNKING"); expect(q2.answer).toEqual({ correctOptionIndex: 0 });
    expect(["q1", "q2", "q4"].map(id => cardCheckbox(id).checked)).toEqual([true, true, true]);      // selection is UI state, still there
    act(() => h.undo());
    expect(meta("q1")).toEqual({ primaryTopicId: "IP_ADDRESSING", difficulty: 3 }); expect(meta("q2")).toBeUndefined(); expect(meta("q4")).toBeUndefined();
    act(() => h.redo());
    expect(meta("q4")).toEqual({ primaryTopicId: "SUBNET_CIDR", difficulty: 4, cognitiveLevel: "apply", objectiveIds: ["obj-subnet"] });
  });
  it("explicit clear vs leave-unchanged; a same-value / unchanged operation creates no history and no dirt", async () => {
    render(<Host />); await tick();
    fireEvent.click(cardCheckbox("q1")); fireEvent.click(cardCheckbox("q3"));
    let dialog = await openClassify();
    fireEvent.change(within(dialog).getByRole("combobox", { name: "الصعوبة" }), { target: { value: "__clear__" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "تطبيق التصنيف" })); await tick();
    expect(meta("q1")).toEqual({ primaryTopicId: "IP_ADDRESSING" }); expect(meta("q3")).toEqual({ primaryTopicId: "OSI_TCPIP" });
    expect(h.pastLength).toBe(1);
    dialog = await openClassify();
    fireEvent.click(within(dialog).getByRole("button", { name: "تطبيق التصنيف" })); await tick();       // everything "بدون تغيير"
    expect(h.pastLength).toBe(1);
    dialog = await openClassify();
    fireEvent.change(within(dialog).getByRole("combobox", { name: "الصعوبة" }), { target: { value: "__clear__" } });   // already cleared → same values
    fireEvent.click(within(dialog).getByRole("button", { name: "تطبيق التصنيف" })); await tick();
    expect(h.pastLength).toBe(1);
    act(() => h.undo()); expect(h.dirty).toBe(false); expect(meta("q1")).toEqual({ primaryTopicId: "IP_ADDRESSING", difficulty: 3 });
  });
  it("stale selection: a question deleted before applying is ignored (never resurrected); the others change", async () => {
    render(<Host />); await tick();
    fireEvent.click(cardCheckbox("q1")); fireEvent.click(cardCheckbox("q4"));
    const dialog = await openClassify();
    fireEvent.change(within(dialog).getByRole("combobox", { name: "المستوى المعرفي" }), { target: { value: "analyze" } });
    fireEvent.click(within(card("q4")).getByRole("button", { name: "حذف" })); await tick();               // deleted while the dialog is open
    fireEvent.click(within(dialog).getByRole("button", { name: "تطبيق التصنيف" })); await tick();
    expect(h.latest!.sections.flatMap(s => s.questions).map(q => q.examQuestionId)).toEqual(["q1", "q2", "q3"]);
    expect(meta("q1")).toEqual({ primaryTopicId: "IP_ADDRESSING", difficulty: 3, cognitiveLevel: "analyze" });
  });
});

describe("F7 — Blueprint → Question Bank guided discovery (exact, manual, teacher-controlled)", () => {
  it("a topic row opens the picker with the exact topic filter; difficulty and mcq rows likewise; objective / section rows offer no bank action", async () => {
    const bank = bankService();
    render(<Host bank={bank} />); await tick();
    let dialog = await openCov();
    expect(within(rowOf(dialog, "c-obj")).queryByRole("button", { name: "ابحث في بنك الأسئلة" })).toBeNull();
    expect(within(rowOf(dialog, "c-s2")).queryByRole("button", { name: "ابحث في بنك الأسئلة" })).toBeNull();
    expect(within(rowOf(dialog, "total-questions")).queryByRole("button", { name: "ابحث في بنك الأسئلة" })).toBeNull();
    fireEvent.click(within(rowOf(dialog, "c-ip")).getByRole("button", { name: "ابحث في بنك الأسئلة" }));
    let picker = await screen.findByRole("dialog", { name: "إضافة من بنك الأسئلة" });
    await waitFor(() => expect(bank.list).toHaveBeenCalled()); await tick();
    expect((within(picker).getByLabelText("الموضوع") as HTMLSelectElement).value).toBe("IP_ADDRESSING");
    expect((within(picker).getByLabelText("الصعوبة") as HTMLSelectElement).value).toBe("");
    let rows = within(picker).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1); expect(rows[0].textContent).toContain("ما هو IP؟");
    expect(within(picker).queryAllByRole("checkbox", { checked: true })).toHaveLength(0);              // nothing auto-selected
    expect(h.pastLength).toBe(0); expect(h.latest!.sections.flatMap(s => s.questions)).toHaveLength(4);   // nothing auto-inserted
    // the teacher may change the filters freely
    fireEvent.change(within(picker).getByLabelText("الموضوع"), { target: { value: "" } });
    expect(within(picker).getAllByRole("row").slice(1)).toHaveLength(3);
    const used = within(picker).getByRole("checkbox", { name: "اختيار السؤال: VLAN" }) as HTMLInputElement;
    expect(used.disabled).toBe(true);                                                                  // BANK-3 already in the exam → locked
    fireEvent.click(within(picker).getByRole("button", { name: "إغلاق" })); await tick();
    dialog = await openCov();
    fireEvent.click(within(rowOf(dialog, "c-d3")).getByRole("button", { name: "ابحث في بنك الأسئلة" }));
    picker = await screen.findByRole("dialog", { name: "إضافة من بنك الأسئلة" }); await tick();
    expect((within(picker).getByLabelText("الصعوبة") as HTMLSelectElement).value).toBe("3");
    expect((within(picker).getByLabelText("الموضوع") as HTMLSelectElement).value).toBe("");
    rows = within(picker).getAllByRole("row").slice(1); expect(rows).toHaveLength(1); expect(rows[0].textContent).toContain("احسب القناع");
    fireEvent.click(within(picker).getByRole("button", { name: "إغلاق" })); await tick();
    dialog = await openCov();
    fireEvent.click(within(rowOf(dialog, "c-mcq")).getByRole("button", { name: "ابحث في بنك الأسئلة" }));
    picker = await screen.findByRole("dialog", { name: "إضافة من بنك الأسئلة" }); await tick();
    expect((within(picker).getByLabelText("النوع") as HTMLSelectElement).value).toBe("multipleChoice");
  });
  it("without a bank service no bank action is offered at all", async () => {
    render(<Host />); await tick();
    const dialog = await openCov();
    expect(within(dialog).queryAllByRole("button", { name: "ابحث في بنك الأسئلة" })).toHaveLength(0);
  });
});
