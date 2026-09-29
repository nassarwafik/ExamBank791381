// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam, BuilderQuestion } from "./examTypes";
import type { BackupStorage } from "./examAutosave";
import { networkingBlueprint } from "./assessmentBlueprintFixtures";

// Phase 13C-A — the Blueprint authoring surface (مخطط الامتحان) and question classification, exercised through the REAL
// StructuredExamBuilder + REAL 13A history hook: every persisted edit is ONE onChange(updater) → one undo step; opening
// the panel never dirties an exam; a legacy exam without a blueprint stays untouched.

const mcq = (id: string, text: string, over: Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...over } as BuilderQuestion);
const makeExam = (over: Partial<StructuredExam> = {}): StructuredExam => ({
  examId: "ex1", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [
    { id: "s1", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", "ما هو الراوتر"), mcq("q2", "سؤال بنك", { origin: "bank", bankQuestionId: "BANK-3", topic: "VLAN_TRUNKING", difficulty: 4 })] },
    { id: "s2", title: "الأمن", gradingPolicy: "all", stimuli: {}, questions: [mcq("q4", "جدار الحماية")] }
  ], ...over
} as StructuredExam);
const memStorage = (): BackupStorage & { map: Map<string, string> } => { const map = new Map<string, string>(); return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } }; };

type Handles = { latest: StructuredExam | null; dirty: boolean; canUndo: boolean; canRedo: boolean; pastLength: number; open: (e: StructuredExam, source?: "saved" | "unsaved") => void; undo: () => void; redo: () => void; updateCalls: number };
const h = {} as Handles;
function Host({ initial, storage, scope }: { initial?: StructuredExam; storage?: BackupStorage; scope?: string }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial ?? makeExam(), "saved"); } }, [hist, initial]);
  useEffect(() => { Object.assign(h, { latest: hist.present, dirty: hist.dirty, canUndo: hist.canUndo, canRedo: hist.canRedo, pastLength: hist.history.past.length, open: hist.open, undo: hist.undo, redo: hist.redo }); }, [hist]);
  const [saving] = useState(false);
  if (!hist.present) return null;
  return (
    <StructuredExamBuilder exam={hist.present} onChange={u => { h.updateCalls += 1; hist.update(u); }} onSave={() => {}} saving={saving}
      onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)}
      backupStorage={storage ?? null} recoveryScope={scope} onRecover={hist.recover} autosaveDelayMs={5} />
  );
}
const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const bpBtn = () => screen.getByRole("button", { name: /مخطط الامتحان/ });
const openPanel = async () => { fireEvent.click(bpBtn()); return await screen.findByRole("dialog", { name: "مخطط الامتحان" }); };
const closePanel = async (dialog: HTMLElement) => { fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" })); await tick(); };
const bp = () => h.latest!.blueprint!;
const q = (id: string) => h.latest!.sections.flatMap(s => s.questions).find(x => x.examQuestionId === id) as BuilderQuestion & Record<string, unknown>;
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const undoBtn = () => screen.getByRole("button", { name: "تراجع" });
const redoBtn = () => screen.getByRole("button", { name: "إعادة" });
const chip = () => (document.querySelector(".sb-save-state") as HTMLElement | null)?.textContent ?? "";

beforeEach(() => { window.confirm = vi.fn(() => true); h.updateCalls = 0; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("مخطط الامتحان — legacy safety and subject context", () => {
  it("an exam without a blueprint opens normally; opening and closing the panel changes nothing (no dirty, no entry, no default subject)", async () => {
    render(<Host />); await tick();
    expect(h.latest!.blueprint).toBeUndefined();
    const dialog = await openPanel();
    expect(within(dialog).getByRole("textbox", { name: "اسم المادة" })).toHaveProperty("value", "");
    expect(within(dialog).getByRole("textbox", { name: "معرّف المادة" })).toHaveProperty("value", "");
    await closePanel(dialog);
    expect(h.latest!.blueprint).toBeUndefined(); expect(h.dirty).toBe(false); expect(h.pastLength).toBe(0); expect(h.updateCalls).toBe(0);
    expect(JSON.stringify(h.latest)).not.toContain("networking");
  });
  it("editing the subject creates a schemaVersion-1 blueprint through ONE history step; undo removes it, redo restores it; the save chip turns dirty", async () => {
    render(<Host />); await tick();
    const dialog = await openPanel();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "اسم المادة" }), { target: { value: "الفيزياء" } });
    expect(bp().schemaVersion).toBe(1); expect(bp().subject.label).toBe("الفيزياء"); expect(bp().subject.id).toBe("");
    expect(h.pastLength).toBe(1); expect(chip()).toBe("● تغييرات غير محفوظة");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "معرّف المادة" }), { target: { value: "physics" } });
    expect(bp().subject).toEqual({ id: "physics", label: "الفيزياء" }); expect(h.pastLength).toBe(2);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "المستوى" }), { target: { value: "العاشر" } });
    expect(bp().level?.label).toBe("العاشر");
    fireEvent.click(undoBtn()); fireEvent.click(undoBtn()); fireEvent.click(undoBtn());
    expect(h.latest!.blueprint).toBeUndefined(); expect(chip()).toBe("✓ محفوظ");
    fireEvent.click(redoBtn());
    expect(bp().subject.label).toBe("الفيزياء"); expect(bp().subject.id).toBe("");
  });
});

describe("مخطط الامتحان — topics, objectives, targets, constraints", () => {
  it("add topic → rename keeps the stable id → add child (depth 1) → remove; each is one history step", async () => {
    render(<Host />); await tick();
    const dialog = await openPanel();
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة موضوع" }));
    expect(bp().topics).toHaveLength(1);
    const id = bp().topics[0].id; expect(id).toMatch(/^t-/);
    const row = () => within(dialog).getAllByRole("listitem").find(li => li.getAttribute("data-topic-id") === id)!;
    fireEvent.change(within(row()).getByRole("textbox", { name: "اسم الموضوع" }), { target: { value: "الميكانيكا" } });
    expect(bp().topics[0]).toMatchObject({ id, label: "الميكانيكا" });
    fireEvent.change(within(row()).getByRole("textbox", { name: "اسم الموضوع" }), { target: { value: "الميكانيكا الكلاسيكية" } });
    expect(bp().topics[0].id).toBe(id);
    fireEvent.click(within(row()).getByRole("button", { name: "إضافة موضوع فرعي" }));
    expect(bp().topics).toHaveLength(2); expect(bp().topics[1].parentId).toBe(id);
    const child = within(dialog).getAllByRole("listitem").find(li => li.getAttribute("data-topic-id") === bp().topics[1].id)!;
    expect(child.getAttribute("data-depth")).toBe("1");
    fireEvent.change(within(child).getByRole("textbox", { name: "اسم الموضوع" }), { target: { value: "الحركة" } });
    expect(h.pastLength).toBe(5);
    fireEvent.click(within(child).getByRole("button", { name: "حذف الموضوع" }));
    expect(bp().topics).toHaveLength(1); expect(h.pastLength).toBe(6);
    fireEvent.click(undoBtn());
    expect(bp().topics).toHaveLength(2);
  });
  it("objectives: add, edit label, link to a topic, remove", async () => {
    render(<Host initial={makeExam({ blueprint: networkingBlueprint })} />); await tick();
    const dialog = await openPanel();
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة هدف تعليمي" }));
    expect(bp().objectives).toHaveLength(3);
    const oid = bp().objectives[2].id;
    const row = within(dialog).getAllByRole("listitem").find(li => li.getAttribute("data-objective-id") === oid)!;
    fireEvent.change(within(row).getByRole("textbox", { name: "نص الهدف" }), { target: { value: "يشرح طبقة النقل" } });
    fireEvent.change(within(row).getByRole("combobox", { name: "موضوع الهدف" }), { target: { value: "OSI_TCPIP" } });
    expect(bp().objectives[2]).toMatchObject({ id: oid, label: "يشرح طبقة النقل", topicId: "OSI_TCPIP" });
    fireEvent.click(within(row).getByRole("button", { name: "حذف الهدف" }));
    expect(bp().objectives).toHaveLength(2);
  });
  it("targets and constraints: add / edit / remove with live structured issues (never auto-repaired)", async () => {
    render(<Host initial={makeExam({ blueprint: networkingBlueprint })} />); await tick();
    const dialog = await openPanel();
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "إجمالي العلامات المستهدف" }), { target: { value: "80" } });
    expect(bp().targets?.totalMarks).toBe(80);
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة قيد" }));
    expect(bp().constraints).toHaveLength(5);
    const cid = bp().constraints[4].id;
    const row = () => within(dialog).getAllByRole("listitem").find(li => li.getAttribute("data-constraint-id") === cid)!;
    fireEvent.change(within(row()).getByRole("combobox", { name: "البُعد" }), { target: { value: "topic" } });
    fireEvent.change(within(row()).getByRole("combobox", { name: "المرجع" }), { target: { value: "OSI_TCPIP" } });
    fireEvent.change(within(row()).getByRole("combobox", { name: "المقياس" }), { target: { value: "marks" } });
    fireEvent.change(within(row()).getByRole("combobox", { name: "الوحدة" }), { target: { value: "percent" } });
    fireEvent.change(within(row()).getByRole("spinbutton", { name: "الهدف" }), { target: { value: "140" } });
    expect(bp().constraints[4]).toMatchObject({ id: cid, dimension: "topic", ref: "OSI_TCPIP", metric: "marks", unit: "percent", target: 140 });
    const issues = within(dialog).getByRole("list", { name: "مشكلات المخطط" });
    expect(issues.querySelector('[data-code="PERCENT_OUT_OF_RANGE"]')).toBeTruthy();
    fireEvent.change(within(row()).getByRole("spinbutton", { name: "الهدف" }), { target: { value: "30" } });
    expect(within(dialog).queryByRole("list", { name: "مشكلات المخطط" })).toBeNull();
    fireEvent.click(within(row()).getByRole("button", { name: "حذف القيد" }));
    expect(bp().constraints).toHaveLength(4);
    expect(h.pastLength).toBe(8);
  });
});

describe("autosave / recovery include blueprint edits naturally", () => {
  it("a blueprint edit is autosaved; a fresh session offers the recovered blueprint", async () => {
    const storage = memStorage();
    const { unmount } = render(<Host storage={storage} scope="teacher-1" />); await tick();
    const dialog = await openPanel();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "اسم المادة" }), { target: { value: "الكيمياء" } });
    await tick(20);
    expect([...storage.map.values()].some(v => v.includes("الكيمياء"))).toBe(true);
    unmount(); cleanup();
    render(<Host storage={storage} scope="teacher-1" />); await tick();
    fireEvent.click(await screen.findByRole("button", { name: "استرجاع النسخة" }));
    await tick();
    expect(bp().subject.label).toBe("الكيمياء");
  });
});

describe("question classification (optional, additive, one history step per change)", () => {
  it("primary topic, secondary topics, objectives, difficulty and cognitive level persist in assessmentMeta; undo works; bank provenance untouched", async () => {
    render(<Host initial={makeExam({ blueprint: networkingBlueprint })} />); await tick();
    const c = card("q2");
    fireEvent.change(within(c).getByRole("combobox", { name: "الموضوع الرئيسي" }), { target: { value: "SUBNET_CIDR" } });
    expect(q("q2").assessmentMeta).toEqual({ primaryTopicId: "SUBNET_CIDR" });
    fireEvent.click(within(within(c).getByRole("group", { name: "مواضيع ثانوية" })).getByRole("checkbox", { name: "OSI و TCP/IP" }));
    fireEvent.click(within(within(c).getByRole("group", { name: "الأهداف التعليمية" })).getByRole("checkbox", { name: "يحسب قناع الشبكة وعدد المضيفين" }));
    fireEvent.change(within(c).getByRole("combobox", { name: "الصعوبة" }), { target: { value: "3" } });
    fireEvent.change(within(c).getByRole("combobox", { name: "المستوى المعرفي" }), { target: { value: "apply" } });
    expect(q("q2").assessmentMeta).toEqual({ primaryTopicId: "SUBNET_CIDR", secondaryTopicIds: ["OSI_TCPIP"], objectiveIds: ["obj-subnet"], difficulty: 3, cognitiveLevel: "apply" });
    expect(h.pastLength).toBe(5);
    expect(q("q2")).toMatchObject({ bankQuestionId: "BANK-3", topic: "VLAN_TRUNKING", difficulty: 4 });
    fireEvent.click(undoBtn());
    expect(q("q2").assessmentMeta).toEqual({ primaryTopicId: "SUBNET_CIDR", secondaryTopicIds: ["OSI_TCPIP"], objectiveIds: ["obj-subnet"], difficulty: 3 });
  });
  it("legacy bank evidence is shown but never mapped by guess; without a blueprint the topic controls explain where topics come from", async () => {
    render(<Host initial={makeExam({ blueprint: networkingBlueprint })} />); await tick();
    expect(within(card("q2")).getByText(/موضوع البنك: VLAN_TRUNKING/)).toBeTruthy();
    expect(within(card("q2")).getByText(/غير مربوط بالمخطط/)).toBeTruthy();
    expect((within(card("q2")).getByRole("combobox", { name: "الموضوع الرئيسي" }) as HTMLSelectElement).value).toBe("");
    cleanup();
    render(<Host />); await tick();
    expect(within(card("q1")).getByText(/أضف مواضيع في مخطط الامتحان/)).toBeTruthy();
    expect(within(card("q1")).getByRole("combobox", { name: "الصعوبة" })).toBeTruthy();                // difficulty / cognitive still available
  });
  it("duplicate and move-to-section keep the classification", async () => {
    render(<Host initial={makeExam({ blueprint: networkingBlueprint })} />); await tick();
    fireEvent.change(within(card("q1")).getByRole("combobox", { name: "الموضوع الرئيسي" }), { target: { value: "OSI_TCPIP" } });
    fireEvent.click(within(card("q1")).getByRole("button", { name: "تكرار" }));
    const copy = h.latest!.sections[0].questions[1];
    expect(copy.examQuestionId).not.toBe("q1"); expect((copy as unknown as Record<string, unknown>).assessmentMeta).toEqual({ primaryTopicId: "OSI_TCPIP" });
    fireEvent.change(within(card("q1")).getByRole("combobox", { name: "نقل إلى قسم" }), { target: { value: "s2" } });
    expect(q("q1").assessmentMeta).toEqual({ primaryTopicId: "OSI_TCPIP" });
    expect(h.latest!.sections[1].questions.map(x => x.examQuestionId)).toContain("q1");
  });
});

describe("interactive context (activity) authoring", () => {
  it("a question-level activity descriptor is authored as data, shows its trust state (zero approved production renderers) and persists through history", async () => {
    render(<Host />); await tick();
    const c = card("q1");
    fireEvent.click(within(c).getByRole("button", { name: "إضافة نشاط تفاعلي (سياق)" }));
    expect(q("q1").activity).toMatchObject({ kind: "simulation", version: 1 });
    expect(h.pastLength).toBe(1);
    fireEvent.change(within(c).getByRole("textbox", { name: "مفتاح النشاط" }), { target: { value: "projectile" } });
    fireEvent.change(within(c).getByRole("textbox", { name: "عنوان النشاط" }), { target: { value: "محاكاة المقذوف" } });
    fireEvent.change(within(c).getByRole("textbox", { name: "إعدادات النشاط (JSON)" }), { target: { value: '{"angle":45}' } });
    expect(q("q1").activity).toMatchObject({ kind: "simulation", key: "projectile", version: 1, title: "محاكاة المقذوف", config: { angle: 45 } });
    expect(within(c).getByText(/غير معتمد للامتحان/)).toBeTruthy();
    fireEvent.change(within(c).getByRole("textbox", { name: "إعدادات النشاط (JSON)" }), { target: { value: '{"answer":"4"}' } });
    expect(within(c).getByRole("list", { name: "مشكلات النشاط" }).querySelector('[data-code="SECRET_IN_CONFIG"]')).toBeTruthy();
    fireEvent.click(within(c).getByRole("button", { name: "إزالة النشاط" }));
    expect(q("q1").activity).toBeUndefined();
    fireEvent.click(undoBtn());
    expect(q("q1").activity).toMatchObject({ key: "projectile" });
  });
  it("a shared-stimulus activity is authored once on the section stimulus", async () => {
    render(<Host />); await tick();
    fireEvent.click(screen.getAllByRole("button", { name: "+ إضافة مادة مشتركة" })[0]);
    const stimId = Object.keys(h.latest!.sections[0].stimuli || {})[0];
    expect(stimId).toBeTruthy();
    const stim = document.querySelector(".sb-stimulus") as HTMLElement;
    fireEvent.click(within(stim).getByRole("button", { name: "إضافة نشاط تفاعلي (سياق)" }));
    fireEvent.change(within(stim).getByRole("textbox", { name: "مفتاح النشاط" }), { target: { value: "circuit" } });
    expect(h.latest!.sections[0].stimuli![stimId].activity).toMatchObject({ kind: "simulation", key: "circuit", version: 1 });
    expect(h.latest!.sections[0].questions.every(x => !(x as unknown as Record<string, unknown>).activity)).toBe(true);   // not copied into questions
  });
});
