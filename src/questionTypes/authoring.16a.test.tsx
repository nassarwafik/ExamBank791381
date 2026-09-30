// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import { registerQuestionTypePlugin } from "./registerQuestionTypePlugin";
import { validateStructuredExam, hasBlockingErrors } from "../examQuality";

// Phase 16A — authoring: A18 Question Type Palette (search / category / keyboard / RTL / empty state), Wave 1 editors inside the
// real Builder, A19 history (undo / redo keep the exact type + config), type change goes through the shared confirmation, the
// inspector metadata, A16 unknown imported type → unsupported authoring state, A3 synthetic plugin authoring without central
// branches. Fail-first on 6468cc7 (palette / registry absent).
type Hist = ReturnType<typeof useStructuredExamHistory>;
const baseExam = (questions: BuilderQuestion[] = [newQuestion("multipleChoice", { examQuestionId: "q1", text: "سؤال أول" })]): StructuredExam => ({ examId: "EXAM-16A", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} />;
}
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
async function mount(initial = baseExam()) { let hist!: Hist; render(<Host initial={initial} onHistory={h => { hist = h; }} />); await tick(20); return { hist: () => hist }; }
async function openPalette() { fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" })); const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30); return d; }
const cards = (d: HTMLElement) => within(d).getAllByTestId("qt-card");

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("16A A18 — Question Type Palette", () => {
  it("opens lazily from «+ إضافة سؤال», shows one card per catalog type with label, description, grading mode and capability chips, grouped by category; RTL", async () => {
    await mount();
    const d = await openPalette();
    expect(d.getAttribute("dir") === "rtl" || d.closest("[dir=rtl]") !== null || document.documentElement.dir === "rtl").toBe(true);
    const all = cards(d); expect(all.length).toBe(15);
    const ms = all.find(c => c.getAttribute("data-type-key") === "multipleSelect")!;
    expect(ms.textContent).toContain("اختيار متعدد الإجابات"); expect(ms.textContent).toContain("تصحيح تلقائي"); expect(ms.textContent).toContain("علامة جزئية"); expect(ms.textContent).toContain("يدعم السؤال المركب");
    const mcq = all.find(c => c.getAttribute("data-type-key") === "multipleChoice")!; expect(mcq.textContent).toContain("اختيار من متعدد");
    const sa = all.find(c => c.getAttribute("data-type-key") === "shortAnswer")!; expect(sa.textContent).toMatch(/هجين|يدوي/);
    expect(within(d).getAllByRole("tab").map(t => t.textContent)).toEqual(expect.arrayContaining(["الكل", "اختيار", "إجابات", "منظّم", "تفاعلي", "مركّب"]));
  });
  it("search filters by label / description with an empty state; category tabs narrow the list; keyboard arrows move between cards and Enter adds the type", async () => {
    const { hist } = await mount();
    const d = await openPalette();
    fireEvent.change(within(d).getByRole("searchbox", { name: "ابحث عن نوع سؤال" }), { target: { value: "رقمية" } });
    await tick();
    expect(cards(d).map(c => c.getAttribute("data-type-key"))).toEqual(["numericResponse"]);
    fireEvent.change(within(d).getByRole("searchbox", { name: "ابحث عن نوع سؤال" }), { target: { value: "zzzz لا شيء" } });
    await tick();
    expect(within(d).getByTestId("qt-empty").textContent).toContain("لا توجد أنواع مطابقة");
    fireEvent.change(within(d).getByRole("searchbox", { name: "ابحث عن نوع سؤال" }), { target: { value: "" } });
    fireEvent.click(within(d).getByRole("tab", { name: "منظّم" }));
    await tick();
    const structured = cards(d).map(c => c.getAttribute("data-type-key"));
    expect(structured).toEqual(expect.arrayContaining(["matching", "ordering", "tableFill", "matrix", "categorization"])); expect(structured).not.toContain("multipleChoice");
    fireEvent.click(within(d).getByRole("tab", { name: "الكل" }));
    await tick();
    const first = cards(d)[0]; first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(cards(d)[1]);
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    const last = cards(d)[cards(d).length - 1]; expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "ArrowUp" }); expect(document.activeElement).toBe(cards(d)[cards(d).length - 2]);
    const target = cards(d).find(c => c.getAttribute("data-type-key") === "categorization")!; target.focus();
    fireEvent.keyDown(target, { key: "Enter" }); fireEvent.click(target);
    await tick(30);
    const qs = hist().present!.sections[0].questions;
    expect(qs.length).toBe(2); expect(qs[1].presentationType).toBe("categorization"); expect(qs[1].questionTypeVersion).toBe(1);
    expect(screen.queryByRole("dialog", { name: "إضافة سؤال" })).toBeNull();
    expect(JSON.stringify(hist().present)).not.toMatch(/palette|search|category/);                       // no UI state persisted into the exam
  });
});

describe("16A — Wave 1 authoring editors inside the Builder + A19 history", () => {
  it("multipleSelect: stable option ids, several correct checkboxes, scoring mode; edits are canonical Builder updates (undo / redo restore the exact config; dirty state)", async () => {
    const { hist } = await mount(baseExam([newQuestion("multipleSelect", { examQuestionId: "ms1", text: "أي البروتوكولات؟" })]));
    const editor = await screen.findByTestId("qt-editor-multipleSelect");
    const inputs = within(editor).getAllByPlaceholderText(/الخيار/); expect(inputs.length).toBeGreaterThanOrEqual(2);
    fireEvent.change(inputs[0], { target: { value: "TCP" } }); fireEvent.change(inputs[1], { target: { value: "UDP" } });
    fireEvent.click(within(editor).getByRole("button", { name: "+ إضافة خيار" }));
    await tick();
    const boxes = within(editor).getAllByRole("checkbox", { name: "الصحيح" }); expect(boxes.length).toBe(3);
    fireEvent.click(boxes[0]); fireEvent.click(boxes[1]);
    fireEvent.change(within(editor).getByRole("combobox", { name: "طريقة التصحيح" }), { target: { value: "partialWithPenalty" } });
    await tick();
    const q1 = hist().present!.sections[0].questions[0];
    expect(q1.options!.map(o => o.text)).toEqual(["TCP", "UDP", ""]); expect(q1.options!.every(o => typeof o.id === "string" && o.id)).toBe(true);
    const ids = q1.options!.map(o => o.id!); expect(new Set(ids).size).toBe(3);
    expect((q1.answer as { correctOptionIds: string[] }).correctOptionIds.sort()).toEqual([ids[0], ids[1]].sort()); expect((q1.answer as { scoring: string }).scoring).toBe("partialWithPenalty");
    // reorder keeps the key by identity
    fireEvent.click(within(editor).getAllByRole("button", { name: "أسفل" })[0]);
    await tick();
    const q2 = hist().present!.sections[0].questions[0];
    expect(q2.options!.map(o => o.text)).toEqual(["UDP", "TCP", ""]); expect((q2.answer as { correctOptionIds: string[] }).correctOptionIds.sort()).toEqual([ids[0], ids[1]].sort());
    expect(examSaveState(hist().history, false)).toBe("dirty"); expect(hist().canUndo).toBe(true);
    act(() => hist().undo()); await tick();
    expect(hist().present!.sections[0].questions[0].options!.map(o => o.text)).toEqual(["TCP", "UDP", ""]);
    act(() => hist().redo()); await tick();
    expect(hist().present!.sections[0].questions[0].options!.map(o => o.text)).toEqual(["UDP", "TCP", ""]);
    // identity travels WITH the option (never re-derived from the position): each id still names the same text …
    const byText = (q: BuilderQuestion, t: string) => q.options!.find(o => o.text === t)!.id;
    expect(byText(hist().present!.sections[0].questions[0], "TCP")).toBe(ids[0]); expect(byText(hist().present!.sections[0].questions[0], "UDP")).toBe(ids[1]);
    // … and moving the UNMARKED third option to the top can never make it correct
    fireEvent.click(within(editor).getAllByRole("button", { name: "أعلى" })[2]); await tick();
    fireEvent.click(within(editor).getAllByRole("button", { name: "أعلى" })[1]); await tick();
    const q3 = hist().present!.sections[0].questions[0];
    expect(q3.options!.map(o => o.text)).toEqual(["", "UDP", "TCP"]); expect(q3.options!.map(o => o.id)).toEqual([ids[2], ids[1], ids[0]]);
    const correctTexts = (q3.answer as { correctOptionIds: string[] }).correctOptionIds.map(id => q3.options!.find(o => o.id === id)!.text).sort();
    expect(correctTexts).toEqual(["TCP", "UDP"]);
    expect(within(editor).getAllByRole("checkbox", { name: "الصحيح" }).map(b => (b as HTMLInputElement).checked)).toEqual([false, true, true]);
    expect(hist().present!.sections[0].questions[0].presentationType).toBe("multipleSelect");
    expect(hasBlockingErrors(validateStructuredExam(hist().present!))).toBe(true);                        // the empty third option still blocks → the Builder shows the issue
  });
  it("numericResponse: tolerance / range modes, unit required; matrix: rows / columns / correct column radios; categorization: categories / items / select — all through the one host", async () => {
    const { hist } = await mount(baseExam([newQuestion("numericResponse", { examQuestionId: "n1", text: "ن" }), newQuestion("matrix", { examQuestionId: "x1", text: "م" }), newQuestion("categorization", { examQuestionId: "k1", text: "ص" })]));
    const num = await screen.findByTestId("qt-editor-numericResponse");
    fireEvent.change(within(num).getByRole("combobox", { name: "نمط الإجابة الرقمية" }), { target: { value: "range" } });
    fireEvent.change(within(num).getByRole("spinbutton", { name: "الحد الأدنى" }), { target: { value: "10" } }); fireEvent.change(within(num).getByRole("spinbutton", { name: "الحد الأعلى" }), { target: { value: "12" } });
    fireEvent.click(within(num).getByRole("checkbox", { name: "الوحدة مطلوبة" })); fireEvent.change(within(num).getByRole("textbox", { name: "الوحدة" }), { target: { value: "m/s²" } });
    await tick();
    const n = hist().present!.sections[0].questions[0]; expect(n.answer).toEqual({ mode: "range", min: 10, max: 12, unit: "m/s²" }); expect(n.numeric).toEqual({ unitRequired: true });
    const mx = await screen.findByTestId("qt-editor-matrix");
    fireEvent.change(within(mx).getAllByRole("textbox", { name: /الصف/ })[0], { target: { value: "HTTP" } }); fireEvent.change(within(mx).getAllByRole("textbox", { name: /العمود/ })[0], { target: { value: "Application" } });
    const rowRadios = within(mx).getAllByRole("radio"); fireEvent.click(rowRadios[1]);
    await tick();
    const x = hist().present!.sections[0].questions[1]; const rows = x.matrix!.rows, cols = x.matrix!.columns;
    expect(rows[0].label).toBe("HTTP"); expect(cols[0].label).toBe("Application"); expect((x.answer as { correctColumnByRow: Record<string, string> }).correctColumnByRow[rows[0].id]).toBe(cols[1].id);
    const cat = await screen.findByTestId("qt-editor-categorization");
    fireEvent.change(within(cat).getAllByRole("textbox", { name: /الفئة/ })[0], { target: { value: "حمض" } }); fireEvent.change(within(cat).getAllByRole("textbox", { name: /العنصر/ })[0], { target: { value: "HCl" } });
    const sel = within(cat).getAllByRole("combobox", { name: /فئة العنصر/ })[0]; fireEvent.change(sel, { target: { value: hist().present!.sections[0].questions[2].categorization!.categories[1].id } });
    await tick();
    const k = hist().present!.sections[0].questions[2];
    expect(k.categorization!.categories[0].label).toBe("حمض"); expect(k.categorization!.items[0].label).toBe("HCl"); expect((k.answer as { correctCategoryByItem: Record<string, string> }).correctCategoryByItem[k.categorization!.items[0].id]).toBe(k.categorization!.categories[1].id);
  });
  it("the inspector shows factual registry metadata for the selected question", async () => {
    await mount(baseExam([newQuestion("multipleSelect", { examQuestionId: "ms1", text: "x" })]));
    const meta = await screen.findByTestId("qt-meta");
    expect(meta.textContent).toContain("اختيار متعدد الإجابات"); expect(meta.textContent).toContain("الإصدار 1"); expect(meta.textContent).toContain("تصحيح تلقائي"); expect(meta.textContent).toContain("علامة جزئية"); expect(meta.textContent).toContain("يدعم البنود المركبة");
  });
});

describe("16A §24 — changing a type is destructive and goes through the shared confirmation", () => {
  it("meaningful type-specific content → ConfirmDialog «تغيير نوع السؤال»; cancel keeps everything; confirm carries identity / prompt / marks / number / group / meta / media, resets the body, initialises the new type", async () => {
    const q = newQuestion("multipleSelect", { examQuestionId: "ms1", displayNumber: "7", text: "سؤال", marks: 3, groupId: "g1", options: [{ id: "a", text: "TCP" }, { id: "b", text: "UDP" }], answer: { correctOptionIds: ["a"], scoring: "allOrNothing" }, assessmentMeta: { topicIds: ["t1"] } as never, image: { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,QUJD" }] } });
    const { hist } = await mount(baseExam([q]));
    await screen.findByTestId("qt-editor-multipleSelect");
    fireEvent.change(screen.getByRole("combobox", { name: "نوع السؤال" }), { target: { value: "numericResponse" } });
    const dlg = await screen.findByRole("dialog", { name: "تغيير نوع السؤال" });
    fireEvent.click(within(dlg).getByRole("button", { name: "إلغاء" }));
    await tick();
    expect(hist().present!.sections[0].questions[0].presentationType).toBe("multipleSelect"); expect(hist().present!.sections[0].questions[0].options!.length).toBe(2);
    fireEvent.change(screen.getByRole("combobox", { name: "نوع السؤال" }), { target: { value: "numericResponse" } });
    const dlg2 = await screen.findByRole("dialog", { name: "تغيير نوع السؤال" });
    fireEvent.click(within(dlg2).getByRole("button", { name: "تغيير النوع" }));
    await tick(30);
    const after = hist().present!.sections[0].questions[0];
    expect(after.presentationType).toBe("numericResponse"); expect(after.questionTypeVersion).toBe(1);
    expect(after.examQuestionId).toBe("ms1"); expect(after.displayNumber).toBe("7"); expect(after.text).toBe("سؤال"); expect(after.marks).toBe(3); expect(after.groupId).toBe("g1"); expect(after.assessmentMeta).toEqual({ topicIds: ["t1"] }); expect(after.image?.assets?.length).toBe(1);
    expect("options" in after).toBe(false); expect(JSON.stringify(after.answer)).not.toContain("correctOptionIds"); expect(after.numeric).toEqual({ unitRequired: false });
    expect(document.body.textContent).not.toContain("window.confirm");
  });
  it("a fresh default question changes type without a prompt (nothing meaningful to lose)", async () => {
    const { hist } = await mount(baseExam([newQuestion("multipleChoice", { examQuestionId: "q1", text: "s" })]));
    await tick(20);
    fireEvent.change(screen.getByRole("combobox", { name: "نوع السؤال" }), { target: { value: "trueFalse" } });
    await tick(20);
    expect(screen.queryByRole("dialog", { name: "تغيير نوع السؤال" })).toBeNull();
    expect(hist().present!.sections[0].questions[0].presentationType).toBe("trueFalse");
  });
});

describe("16A A16 — unknown imported type: unsupported authoring state, no crash, finalization blocked, never converted", () => {
  it("renders the unsupported notice with the raw key and keeps the data verbatim", async () => {
    const weird = { examQuestionId: "u1", presentationType: "hotspot", text: "انقر الموقع", marks: 2, hotspots: [{ x: 1 }] } as unknown as BuilderQuestion;
    const { hist } = await mount(baseExam([weird]));
    const notice = await screen.findByTestId("qt-unsupported");
    expect(notice.textContent).toContain("نوع سؤال غير مدعوم"); expect(notice.textContent).toContain("hotspot");
    const q = hist().present!.sections[0].questions[0];
    expect(q.presentationType).toBe("hotspot"); expect((q as unknown as { hotspots: unknown[] }).hotspots.length).toBe(1);
    const issues = validateStructuredExam(hist().present!);
    expect(issues.some(i => i.code === "UNKNOWN_QUESTION_TYPE" && i.severity === "error")).toBe(true);
    expect(screen.getByRole("combobox", { name: "نوع السؤال" })).toBeTruthy();                           // the teacher can still resolve it by choosing a type
  });
});

describe("16A A3 — a synthetic interactive plugin authors through the seam", () => {
  it("registerQuestionTypePlugin makes the type available to newQuestion, the palette, the body host and validation — without any change to the central files", async () => {
    const unregister = registerQuestionTypePlugin({
      definition: { key: "syntheticInteractive", version: 1, label: "محاكاة تجريبية", description: "نوع تجريبي للاختبار", category: "interactive", gradingMode: "auto", capabilities: { autoGrading: true, manualGrading: false, hybridGrading: false, partialCredit: true, compoundPart: true, interactive: true, requiresImage: false, offline: false }, responseKinds: ["fields"], legacy: false, icon: "⚙" },
      versions: { 1: {
        defaults: ensure => { ensure("simulation", { links: [{ id: "l1", label: "Link 1" }] }); ensure("answer", { expectedState: { l1: "up" } }); },
        validate: node => (Array.isArray((node.simulation as { links?: unknown[] })?.links) && (node.simulation as { links: unknown[] }).links.length ? [] : [{ code: "SIM_NO_LINKS", message: "لا توجد وصلات.", severity: "error" }]),
        Editor: ({ node }) => <div data-testid="qt-editor-syntheticInteractive">محرر المحاكاة: {((node as unknown as Record<string, unknown>).simulation as { links: { label: string }[] }).links.map(l => l.label).join(", ")}</div>,
        StudentRenderer: ({ answer, onAnswer }) => <button type="button" onClick={() => onAnswer({ kind: "fields", values: { l1: "up" } })}>{answer?.kind === "fields" ? "up" : "down"}</button>
      } }
    });
    try {
      const q = newQuestion("syntheticInteractive" as never, { examQuestionId: "sim1", text: "شغّل الوصلة" });
      expect((q as unknown as { simulation: unknown }).simulation).toEqual({ links: [{ id: "l1", label: "Link 1" }] }); expect(q.questionTypeVersion).toBe(1);
      const { hist } = await mount(baseExam([q]));
      expect((await screen.findByTestId("qt-editor-syntheticInteractive")).textContent).toContain("Link 1");
      expect(hasBlockingErrors(validateStructuredExam(hist().present!))).toBe(false);
      const d = await openPalette();
      expect(cards(d).some(c => c.getAttribute("data-type-key") === "syntheticInteractive")).toBe(true);
    } finally { unregister(); }
  });
});
