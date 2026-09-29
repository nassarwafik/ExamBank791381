// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within, waitFor } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam, BuilderQuestion, BuilderImageAsset } from "./examTypes";

// Phase 13B — Enterprise authoring productivity, exercised through the REAL StructuredExamBuilder + the REAL 13A
// history hook (the App.tsx wiring): navigator (search / filters / jump), multi-selection (UI state, pruned, reset),
// bulk actions (ONE undo step each, project ConfirmDialog, pending-media guard) and the Question Bank picker
// (lazy load, filters, used-question lock, exact insertion = ONE undo step, race guards R1–R8).

const AI_BTN = "✨ إنشاء صورة بالذكاء الاصطناعي";
const IMG_A = "data:image/png;base64,AAAA";

const mcq = (id: string, text: string, over: Partial<BuilderQuestion> & Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...over } as BuilderQuestion);
const makeExam = (examId = "ex1"): StructuredExam => ({
  examId, title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [
    { id: "s1", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", "ما هو الراوتر"), mcq("q2", "ما هو السويتش", { presentationType: "shortAnswer", answer: {} }), mcq("q3", "عنوان IP", { origin: "bank", bankQuestionId: "BANK-3", questionNumber: "17", topic: "IPV4", difficulty: 3 })] },
    { id: "s2", title: "الأمن", gradingPolicy: "all", stimuli: {}, questions: [mcq("q4", "جدار الحماية"), mcq("q5", "التشفير")] },
    { id: "s3", title: "فارغ", gradingPolicy: "all", stimuli: {}, questions: [] }
  ]
} as StructuredExam);

// The bank as the picker sees it: the EXISTING /api/bank-questions rows + the exact-id select response (canonical
// buildExamQuestion output). Both are App-owned authenticated callbacks; the builder never sees a token.
const bankRows = () => [
  { id: "BANK-1", sourceId: "791381-2025", sourceKind: "official", official: true, questionNumber: "1", section: "BASIC", topic: "NETWORK_BASICS", difficulty: 2, difficultyLabel: "", type: "multipleChoice", presentationType: "multipleChoice", text: "ما هو IP؟", options: [{ value: "A", text: "بروتوكول" }, { value: "B", text: "كابل" }], fields: [], wordBank: [], answer: { correctOptionValue: "A", correctOptionIndex: 0 }, hasImage: false, reviewStatus: "classified", createdAt: "", updatedAt: "" },
  { id: "BANK-2", sourceId: "791381-2025", sourceKind: "official", official: true, questionNumber: "2", section: "INFRASTRUCTURE", topic: "SUBNETTING", difficulty: 4, difficultyLabel: "", type: "multiField", presentationType: "fillBlank", text: "أكمل القناع ____", options: [], fields: [{ id: "f1", label: "القناع", correct: "255.255.255.0" }], wordBank: [], answer: { mode: "exactSequence", values: ["255.255.255.0"] }, hasImage: true, reviewStatus: "classified", createdAt: "", updatedAt: "" },
  { id: "BANK-3", sourceId: "manual", sourceKind: "manual", official: false, questionNumber: "", section: "BASIC", topic: "IPV4", difficulty: 3, difficultyLabel: "", type: "multipleChoice", presentationType: "multipleChoice", text: "عنوان IP", options: [{ value: "a", text: "x" }, { value: "b", text: "y" }], fields: [], wordBank: [], answer: { correctOptionValue: "a" }, hasImage: false, reviewStatus: "classified", createdAt: "", updatedAt: "" },
  { id: "BANK-4", sourceId: "import-x", sourceKind: "import", official: false, questionNumber: "9", section: "BASIC", topic: "VLAN", difficulty: 1, difficultyLabel: "", type: "shortAnswer", presentationType: "open", text: "عرّف VLAN", options: [], fields: [], wordBank: [], answer: { values: ["شبكة"] }, hasImage: false, reviewStatus: "classified", createdAt: "", updatedAt: "" }
];
const canonical = (id: string) => {
  const row = bankRows().find(r => r.id === id)!;
  return { examQuestionId: "", origin: "bank", bankQuestionId: id, sourceId: row.sourceId, sourceQuestionId: row.questionNumber, questionNumber: row.questionNumber, section: row.section, topic: row.topic, secondaryTopics: [], difficulty: row.difficulty, difficultyLabel: "", familyKey: "fam-" + id, hasCLI: false, requiresCalculation: false, presentationType: row.presentationType, bankType: row.type, marks: 0, locked: false, text: row.text, textHtml: "", options: row.options.map((o, i) => ({ ...o, label: o.text, order: i })), fields: row.fields.map(f => ({ ...f, kind: "text", order: 1 })), parts: [], answer: row.answer, hint: "", teacherNote: "", aiInstruction: "", wasModified: false, image: { exists: row.hasImage, visible: row.hasImage, origin: row.hasImage ? "bank" : null, assets: row.hasImage ? [{ id: "as-" + id, origin: "bank", blobName: id + ".png", contentType: "image/png", dataUrl: "/api/question-image?blob=" + id + ".png&exp=1&sig=abc" }] : [], prompt: null }, history: [], redoStack: [] };
};
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void };
const deferred = <T,>(): Deferred<T> => { let resolve!: (v: T) => void, reject!: (e: Error) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
function fakeBank() {
  const listCalls: Deferred<unknown[]>[] = [];
  const selectCalls: { ids: string[]; d: Deferred<unknown[]> }[] = [];
  return {
    listCalls, selectCalls,
    picker: {
      list: vi.fn(() => { const d = deferred<unknown[]>(); listCalls.push(d); return d.promise; }),
      select: vi.fn((ids: string[]) => { const d = deferred<unknown[]>(); selectCalls.push({ ids, d }); return d.promise; })
    },
    resolveList: async (i = listCalls.length - 1) => { await act(async () => { listCalls[i].resolve(bankRows()); }); },
    resolveSelect: async (i = selectCalls.length - 1) => { await act(async () => { selectCalls[i].d.resolve(selectCalls[i].ids.map(canonical)); }); },
    rejectSelect: async (i = selectCalls.length - 1) => { await act(async () => { selectCalls[i].d.reject(new Error("تعذر الاتصال")); }); }
  };
}
function deferredAI() {
  const pending: Record<string, (a: BuilderImageAsset) => void> = {};
  const fn = vi.fn((q: { examQuestionId: string }) => new Promise<BuilderImageAsset>(r => { pending[q.examQuestionId] = r; }));
  const resolve = async (qid: string, dataUrl: string) => { await act(async () => { pending[qid]({ id: "ai-" + qid, origin: "ai-generated", contentType: "image/png", dataUrl }); }); };
  return { fn, resolve };
}

type Handles = { latest: StructuredExam | null; dirty: boolean; canUndo: boolean; canRedo: boolean; pastLength: number; open: (e: StructuredExam, source?: "saved" | "unsaved") => void; undo: () => void; redo: () => void; setSaving: (v: boolean) => void; updateCalls: number };
const h = {} as Handles;
function Host({ initial, bank, req }: { initial?: StructuredExam; bank?: ReturnType<typeof fakeBank>["picker"]; req?: (q: never) => Promise<BuilderImageAsset> }) {
  const hist = useStructuredExamHistory();
  const [saving, setSaving] = useState(false);
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial ?? makeExam(), "saved"); } }, [hist, initial]);
  useEffect(() => { Object.assign(h, { latest: hist.present, dirty: hist.dirty, canUndo: hist.canUndo, canRedo: hist.canRedo, pastLength: hist.history.past.length, open: hist.open, undo: hist.undo, redo: hist.redo, setSaving }); }, [hist]);
  if (!hist.present) return null;
  return (
    <StructuredExamBuilder exam={hist.present} onChange={u => { h.updateCalls += 1; hist.update(u); }} onSave={() => {}} saving={saving} requestQuestionImage={req as never}
      onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null}
      bankPicker={bank as never} />
  );
}

const sectionIds = (i: number) => h.latest!.sections[i].questions.map(x => x.examQuestionId);
const allIds = () => h.latest!.sections.flatMap(s => s.questions.map(x => x.examQuestionId));
const tick = () => act(async () => { await new Promise(r => setTimeout(r, 5)); });
const navBtn = () => screen.getByRole("button", { name: /مستكشف الأسئلة/ });
const openNav = async () => { fireEvent.click(navBtn()); await tick(); return screen.getByRole("complementary", { name: "مستكشف الأسئلة" }); };
const navCount = () => (document.querySelector(".sb-nav-count") as HTMLElement).textContent ?? "";
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const cardCheckbox = (id: string) => within(card(id)).getByRole("checkbox", { name: "تحديد السؤال" }) as HTMLInputElement;
const bulkBar = () => screen.queryByRole("region", { name: "إجراءات الأسئلة المحددة" });
const selectedCount = () => within(bulkBar()!).getByRole("status").textContent ?? "";
const undoBtn = () => screen.getByRole("button", { name: "تراجع" }) as HTMLButtonElement;
const redoBtn = () => screen.getByRole("button", { name: "إعادة" }) as HTMLButtonElement;
const chip = () => (document.querySelector(".sb-save-state") as HTMLElement | null)?.textContent ?? "";
const pickerBtn = () => screen.getByRole("button", { name: /إضافة من بنك الأسئلة/ });
const openPicker = async (bank: ReturnType<typeof fakeBank>) => { fireEvent.click(pickerBtn()); await waitFor(() => expect(bank.picker.list).toHaveBeenCalled()); await tick(); return screen.getByRole("dialog", { name: "إضافة من بنك الأسئلة" }); };
const pick = (dialog: HTMLElement, text: string) => within(dialog).getByRole("checkbox", { name: "اختيار السؤال: " + text }) as HTMLInputElement;
const insertBtn = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: /^إضافة \d+ أسئلة$/ }) as HTMLButtonElement;
const bankIdOf = (q: BuilderQuestion) => (q as unknown as { bankQuestionId?: string }).bankQuestionId;
const bankCount = (id: string) => h.latest!.sections.flatMap(s => s.questions).filter(q => bankIdOf(q) === id).length;
/** The SAME exam (same examId) after an independent owner update that brought the exact bank question `bankId` into section 0. */
const withBank = (exam: StructuredExam, bankId: string): StructuredExam => ({ ...exam, sections: exam.sections.map((s, i) => (i === 0 ? { ...s, questions: [...s.questions, mcq("qb-" + bankId, "من البنك " + bankId, { origin: "bank", bankQuestionId: bankId })] } : s)) } as StructuredExam);
const ALREADY_USED = "أحد الأسئلة المحددة أُضيف إلى الامتحان أثناء العملية. راجع التحديد ثم أعد المحاولة.";

beforeEach(() => { window.confirm = vi.fn(() => true); h.updateCalls = 0; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("B — navigator: open, search, filters, jump", () => {
  it("opens as a complementary panel grouped by section, with N من M and compact rows (number · preview · type · marks · bank badge)", async () => {
    render(<Host />);
    await tick();
    expect(screen.queryByRole("complementary", { name: "مستكشف الأسئلة" })).toBeNull();
    const nav = await openNav();
    expect(navBtn().getAttribute("aria-pressed")).toBe("true");
    expect(navCount()).toBe("5 من 5 سؤالًا");
    const sections = within(nav).getAllByRole("group");
    expect(sections.map(s => s.getAttribute("aria-label"))).toEqual(["الشبكات", "الأمن", "فارغ"]);
    const row3 = within(nav).getByRole("button", { name: /عنوان IP/ });
    expect(row3.textContent).toContain("3");                                                        // number
    expect(row3.textContent).toContain("اختيار من متعدد");                                          // type
    expect(row3.textContent).toContain("2 علامة");                                                  // marks
    expect(within(row3).getByText("بنك")).toBeTruthy();                                              // bank indicator
    expect(within(within(nav).getByRole("button", { name: /ما هو الراوتر/ })).queryByText("بنك")).toBeNull();
  });

  it("search + filters narrow the NAVIGATOR only (the editor keeps every card); reset clears; empty state", async () => {
    render(<Host />);
    await tick();
    const nav = await openNav();
    fireEvent.change(within(nav).getByRole("searchbox", { name: "بحث في الامتحان" }), { target: { value: "  ip  " } });
    expect(navCount()).toBe("1 من 5 سؤالًا");
    expect(document.querySelectorAll(".sb-question")).toHaveLength(5);                                // the exam is untouched
    fireEvent.change(within(nav).getByRole("searchbox", { name: "بحث في الامتحان" }), { target: { value: "" } });
    fireEvent.change(within(nav).getByRole("combobox", { name: "القسم" }), { target: { value: "s2" } });
    expect(navCount()).toBe("2 من 5 سؤالًا");
    fireEvent.change(within(nav).getByRole("combobox", { name: "النوع" }), { target: { value: "shortAnswer" } });
    expect(navCount()).toBe("0 من 5 سؤالًا");
    expect(within(nav).getByText("لا توجد أسئلة مطابقة.")).toBeTruthy();
    fireEvent.click(within(nav).getByRole("button", { name: "مسح الفلاتر" }));
    expect(navCount()).toBe("5 من 5 سؤالًا");
    fireEvent.change(within(nav).getByRole("combobox", { name: "المصدر" }), { target: { value: "bank" } });
    expect(navCount()).toBe("1 من 5 سؤالًا");
    fireEvent.change(within(nav).getByRole("combobox", { name: "الصعوبة" }), { target: { value: "3" } });
    expect(navCount()).toBe("1 من 5 سؤالًا");
    expect(h.dirty).toBe(false);                                                                     // UI state never dirties the exam
    expect(h.canUndo).toBe(false);
  });

  it("clicking a navigator row jumps to the REAL editor card: scrolled into view, focused, briefly highlighted (by id, not display number)", async () => {
    render(<Host />);
    await tick();
    const scroll = vi.fn();
    (HTMLElement.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scroll;
    const nav = await openNav();
    fireEvent.click(within(nav).getByRole("button", { name: /جدار الحماية/ }));
    const target = card("q4");
    expect(scroll).toHaveBeenCalled();
    expect(document.activeElement).toBe(target);
    expect(target.classList.contains("sb-q-flash")).toBe(true);
    expect(target.getAttribute("data-question-id")).toBe("q4");
  });
});

describe("C — multi-selection (UI state, id-based, pruned, reset)", () => {
  it("select one / select visible / select section / clear; count shows N أسئلة محددة; cards show the selected state", async () => {
    render(<Host />);
    await tick();
    expect(bulkBar()).toBeNull();
    fireEvent.click(cardCheckbox("q1"));
    expect(selectedCount()).toBe("1 أسئلة محددة");
    expect(card("q1").getAttribute("data-selected")).toBe("true");
    expect(within(card("q1")).getByText("محدد")).toBeTruthy();                                       // not colour-only
    const nav = await openNav();
    fireEvent.click(within(nav).getByRole("button", { name: "تحديد القسم الأمن" }));
    expect(selectedCount()).toBe("3 أسئلة محددة");
    fireEvent.change(within(nav).getByRole("searchbox", { name: "بحث في الامتحان" }), { target: { value: "ما هو" } });
    fireEvent.click(within(nav).getByRole("button", { name: "تحديد الظاهر" }));
    expect(selectedCount()).toBe("4 أسئلة محددة");                                                    // q1,q4,q5 + q2 (visible)
    fireEvent.click(within(nav).getByRole("checkbox", { name: "تحديد: ما هو السويتش" }));
    expect(selectedCount()).toBe("3 أسئلة محددة");
    fireEvent.click(within(bulkBar()!).getByRole("button", { name: "إلغاء التحديد" }));
    expect(bulkBar()).toBeNull();
    expect(h.dirty).toBe(false);
  });

  it("R6 — a selected question removed by undo / another operation is pruned; selection is reset when another exam opens", async () => {
    render(<Host />);
    await tick();
    fireEvent.click(cardCheckbox("q1")); fireEvent.click(cardCheckbox("q4"));
    expect(selectedCount()).toBe("2 أسئلة محددة");
    fireEvent.click(within(card("q4")).getByRole("button", { name: "حذف" }));                      // single-card delete (existing)
    expect(selectedCount()).toBe("1 أسئلة محددة");
    act(() => h.undo());                                                                              // q4 is back, but NOT resurrected in the selection
    expect(allIds()).toContain("q4");
    expect(selectedCount()).toBe("1 أسئلة محددة");
    act(() => h.open(makeExam("ex2")));
    await tick();
    expect(bulkBar()).toBeNull();
  });
});

describe("D — bulk actions = ONE history step each", () => {
  it("bulk move of 3 across sections → target, in global order; ONE undo restores the exact prior sections; redo re-applies", async () => {
    render(<Host />);
    await tick();
    for (const id of ["q4", "q1", "q3"]) fireEvent.click(cardCheckbox(id));
    const before = h.latest!.sections;
    fireEvent.change(within(bulkBar()!).getByRole("combobox", { name: "القسم الهدف" }), { target: { value: "s3" } });
    fireEvent.click(within(bulkBar()!).getByRole("button", { name: "نقل إلى قسم" }));
    expect(sectionIds(2)).toEqual(["q1", "q3", "q4"]);
    expect(sectionIds(0)).toEqual(["q2"]); expect(sectionIds(1)).toEqual(["q5"]);
    expect(h.pastLength).toBe(1);
    expect(selectedCount()).toBe("3 أسئلة محددة");                                                    // selection survives the move (ids)
    fireEvent.click(undoBtn());
    expect(h.latest!.sections).toBe(before);
    expect(undoBtn().disabled).toBe(true);
    fireEvent.click(redoBtn());
    expect(sectionIds(2)).toEqual(["q1", "q3", "q4"]);
  });

  it("bulk delete asks through the project ConfirmDialog with the count; cancel keeps everything; confirm removes 3 in ONE undo step", async () => {
    render(<Host />);
    await tick();
    for (const id of ["q1", "q2", "q5"]) fireEvent.click(cardCheckbox(id));
    fireEvent.click(within(bulkBar()!).getByRole("button", { name: "حذف" }));
    await tick();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("سيتم حذف 3 أسئلة من الامتحان.");
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await tick();
    expect(allIds()).toHaveLength(5);
    fireEvent.click(within(bulkBar()!).getByRole("button", { name: "حذف" }));
    await tick();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "حذف" }));
    await tick();
    expect(allIds()).toEqual(["q3", "q4"]);
    expect(h.pastLength).toBe(1);
    expect(bulkBar()).toBeNull();                                                                     // pruned
    fireEvent.click(undoBtn());
    expect(allIds()).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("bulk duplicate of 2: copies right after their originals with fresh ids; ONE undo removes both copies", async () => {
    render(<Host />);
    await tick();
    fireEvent.click(cardCheckbox("q1")); fireEvent.click(cardCheckbox("q4"));
    fireEvent.click(within(bulkBar()!).getByRole("button", { name: "تكرار" }));
    expect(allIds()).toHaveLength(7);
    expect(sectionIds(0)[0]).toBe("q1"); expect(sectionIds(0)[1]).not.toBe("q1"); expect(sectionIds(0)[2]).toBe("q2");
    expect(h.latest!.sections[0].questions[1].text).toBe("ما هو الراوتر");
    expect(h.pastLength).toBe(1);
    fireEvent.click(undoBtn());
    expect(allIds()).toEqual(["q1", "q2", "q3", "q4", "q5"]);
  });

  it("bulk marks: invalid values are rejected before any mutation; a valid value updates only the selected in ONE step", async () => {
    render(<Host />);
    await tick();
    fireEvent.click(cardCheckbox("q2")); fireEvent.click(cardCheckbox("q5"));
    const input = within(bulkBar()!).getByRole("spinbutton", { name: "العلامة الجديدة" });
    for (const bad of ["0", "-3", "abc", ""]) {
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.click(within(bulkBar()!).getByRole("button", { name: "تعيين العلامة" }));
      expect(h.pastLength).toBe(0);
    }
    expect(within(bulkBar()!).getByRole("alert").textContent).toContain("العلامة يجب أن تكون رقمًا أكبر من صفر");
    fireEvent.change(input, { target: { value: "4.5" } });
    fireEvent.click(within(bulkBar()!).getByRole("button", { name: "تعيين العلامة" }));
    expect(h.latest!.sections[0].questions.map(x => x.marks)).toEqual([2, 4.5, 2]);
    expect(h.latest!.sections[1].questions.map(x => x.marks)).toEqual([2, 4.5]);
    expect(h.pastLength).toBe(1);
    expect(chip()).toBe("● تغييرات غير محفوظة");
    fireEvent.click(undoBtn());
    expect(h.latest!.sections[0].questions.map(x => x.marks)).toEqual([2, 2, 2]);
    expect(chip()).toBe("✓ محفوظ");
  });

  it("R7 — a selected question with a pending image blocks move / delete / duplicate with a visible reason; released when the image lands", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    await tick();
    fireEvent.click(within(card("q1")).getByRole("button", { name: AI_BTN }));
    fireEvent.click(cardCheckbox("q1")); fireEvent.click(cardCheckbox("q2"));
    const bar = bulkBar()!;
    for (const name of ["نقل إلى قسم", "حذف", "تكرار"]) expect((within(bar).getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(bar).getByText("انتظر انتهاء معالجة الصور للأسئلة المحددة.")).toBeTruthy();
    expect((within(bar).getByRole("button", { name: "تعيين العلامة" }) as HTMLButtonElement).disabled).toBe(false);   // marks do not invalidate the callback
    await ai.resolve("q1", IMG_A);
    expect((within(bulkBar()!).getByRole("button", { name: "حذف" }) as HTMLButtonElement).disabled).toBe(false);
    expect(h.latest!.sections[0].questions[0].image?.assets?.[0]?.dataUrl).toBe(IMG_A);
  });

  it("R8 — while a save is in progress the bulk actions are disabled like the rest of the editor", async () => {
    render(<Host />);
    await tick();
    fireEvent.click(cardCheckbox("q1"));
    act(() => h.setSaving(true));
    for (const name of ["نقل إلى قسم", "حذف", "تكرار", "تعيين العلامة"]) expect((within(bulkBar()!).getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    act(() => h.setSaving(false));
    expect((within(bulkBar()!).getByRole("button", { name: "تكرار" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("E — Question Bank picker", () => {
  it("lazy: nothing is loaded until opened; loading state; rows with preview info; the already-used exact bankQuestionId is 'مضاف' and locked", async () => {
    const bank = fakeBank();
    render(<Host bank={bank.picker} />);
    await tick();
    expect(bank.picker.list).not.toHaveBeenCalled();
    const dialog = await openPicker(bank);
    expect(within(dialog).getByRole("status").textContent).toContain("جارٍ تحميل بنك الأسئلة");
    await bank.resolveList();
    expect(bank.picker.list).toHaveBeenCalledTimes(1);
    const rows = within(dialog).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    const used = within(dialog).getByRole("row", { name: /عنوان IP/ });
    expect(within(used).getByText("مضاف")).toBeTruthy();
    expect(pick(dialog, "عنوان IP").disabled).toBe(true);
    expect(pick(dialog, "ما هو IP؟").disabled).toBe(false);
    const r2 = within(dialog).getByRole("row", { name: /أكمل القناع/ });
    expect(r2.textContent).toContain("البنى التحتية"); expect(r2.textContent).toContain("SUBNETTING"); expect(r2.textContent).toContain("إكمال فراغ"); expect(r2.textContent).toContain("رسمي"); expect(r2.textContent).toContain("4"); expect(r2.textContent).toContain("2");
    expect(within(r2).getByLabelText("تحتوي صورة")).toBeTruthy();
    expect(h.dirty).toBe(false);                                                                     // opening the picker never dirties the exam
  });

  it("filters (text / section / type / difficulty / source / topic) and preview; select visible respects the lock", async () => {
    const bank = fakeBank();
    render(<Host bank={bank.picker} />);
    await tick();
    const dialog = await openPicker(bank);
    await bank.resolveList();
    fireEvent.change(within(dialog).getByRole("combobox", { name: "القسم" }), { target: { value: "BASIC" } });
    expect(within(dialog).getAllByRole("row").slice(1)).toHaveLength(3);
    fireEvent.change(within(dialog).getByRole("combobox", { name: "المصدر" }), { target: { value: "import" } });
    expect(within(dialog).getAllByRole("row").slice(1)).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "مسح الفلاتر" }));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "الموضوع" }), { target: { value: "SUBNETTING" } });
    expect(within(dialog).getAllByRole("row").slice(1)).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "مسح الفلاتر" }));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "الصعوبة" }), { target: { value: "2" } });
    expect(within(dialog).getAllByRole("row").slice(1)).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "مسح الفلاتر" }));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "النوع" }), { target: { value: "open" } });
    expect(within(dialog).getAllByRole("row").slice(1)).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "مسح الفلاتر" }));
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "ابحث في بنك الأسئلة" }), { target: { value: "ip" } });
    expect(within(dialog).getAllByRole("row").slice(1)).toHaveLength(2);                              // "ما هو IP؟" + "عنوان IP"
    fireEvent.click(within(dialog).getByRole("button", { name: "تحديد الظاهر" }));
    expect(within(dialog).getByText("1 أسئلة محددة")).toBeTruthy();                                   // the used one is skipped
    fireEvent.click(within(within(dialog).getByRole("row", { name: /ما هو IP؟/ })).getByRole("button", { name: "معاينة" }));
    const preview = screen.getByRole("dialog", { name: "معاينة السؤال" });
    expect(preview.textContent).toContain("بروتوكول");
    fireEvent.click(within(preview).getByRole("button", { name: "إغلاق" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء التحديد" }));
    expect(within(dialog).getByText("0 أسئلة محددة")).toBeTruthy();
  });

  it("exact insertion: target section + default marks (1) → ONE updater; questions get fresh examQuestionIds and keep canonical content; ONE undo removes the batch, ONE redo restores it", async () => {
    const bank = fakeBank();
    render(<Host bank={bank.picker} />);
    await tick();
    const dialog = await openPicker(bank);
    await bank.resolveList();
    fireEvent.click(pick(dialog, "ما هو IP؟")); fireEvent.click(pick(dialog, "أكمل القناع ____")); fireEvent.click(pick(dialog, "عرّف VLAN"));
    expect(insertBtn(dialog).textContent).toBe("إضافة 3 أسئلة");
    expect((within(dialog).getByRole("spinbutton", { name: "العلامة لكل سؤال" }) as HTMLInputElement).value).toBe("1");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "القسم الهدف" }), { target: { value: "s3" } });
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "العلامة لكل سؤال" }), { target: { value: "2.5" } });
    fireEvent.click(insertBtn(dialog));
    expect(bank.picker.select).toHaveBeenCalledWith(["BANK-1", "BANK-2", "BANK-4"]);
    expect(insertBtn(dialog).disabled).toBe(true);                                                    // R5: no double submission while pending
    fireEvent.click(insertBtn(dialog));
    await bank.resolveSelect();
    expect(bank.picker.select).toHaveBeenCalledTimes(1);
    const inserted = h.latest!.sections[2].questions;
    expect(inserted).toHaveLength(3);
    expect(inserted.map(x => (x as unknown as { bankQuestionId: string }).bankQuestionId)).toEqual(["BANK-1", "BANK-2", "BANK-4"]);
    expect(inserted.every(x => x.examQuestionId.startsWith("q-") && x.marks === 2.5)).toBe(true);
    expect(inserted[1].image?.assets?.[0]?.dataUrl).toContain("/api/question-image?blob=BANK-2.png");   // the signed asset, not the row
    expect(inserted[1].fields![0].correct).toBe("255.255.255.0"); expect(inserted[1].fields![0].id).not.toBe("f1");
    expect(inserted[2].presentationType).toBe("shortAnswer"); expect(inserted[2].answer).toEqual({ values: ["شبكة"] });
    expect(h.pastLength).toBe(1);
    expect(chip()).toBe("● تغييرات غير محفوظة");
    expect(screen.queryByRole("dialog", { name: "إضافة من بنك الأسئلة" })).toBeNull();               // closed after success
    fireEvent.click(undoBtn());
    expect(h.latest!.sections[2].questions).toHaveLength(0); expect(chip()).toBe("✓ محفوظ");
    fireEvent.click(redoBtn());
    expect(h.latest!.sections[2].questions).toHaveLength(3);
  });

  it("R4 — the exact fetch fails: no mutation, an actionable error, the selection is kept for retry", async () => {
    const bank = fakeBank();
    render(<Host bank={bank.picker} />);
    await tick();
    const dialog = await openPicker(bank);
    await bank.resolveList();
    fireEvent.click(pick(dialog, "ما هو IP؟")); fireEvent.click(pick(dialog, "عرّف VLAN"));
    fireEvent.click(insertBtn(dialog));
    await bank.rejectSelect();
    expect(within(dialog).getByRole("alert").textContent).toContain("تعذر الاتصال");
    expect(allIds()).toHaveLength(5); expect(h.pastLength).toBe(0);
    expect(pick(dialog, "ما هو IP؟").checked).toBe(true); expect(pick(dialog, "عرّف VLAN").checked).toBe(true);
    expect(insertBtn(dialog).disabled).toBe(false);
    fireEvent.click(insertBtn(dialog));
    await bank.resolveSelect();
    expect(h.latest!.sections[0].questions).toHaveLength(5); expect(h.pastLength).toBe(1);
  });

  it("R1/R2 — bank load or exact fetch started on Exam A; Exam B opens before the response: B is untouched, no selection carries over", async () => {
    const bank = fakeBank();
    render(<Host bank={bank.picker} />);
    await tick();
    let dialog = await openPicker(bank);
    act(() => h.open(makeExam("ex2")));                                                             // R1: list still pending
    await tick();
    expect(screen.queryByRole("dialog", { name: "إضافة من بنك الأسئلة" })).toBeNull();
    await bank.resolveList(0);
    expect(h.latest!.examId).toBe("ex2"); expect(allIds()).toHaveLength(5); expect(h.pastLength).toBe(0);
    dialog = await openPicker(bank);
    await bank.resolveList();
    fireEvent.click(pick(dialog, "ما هو IP؟"));
    fireEvent.click(insertBtn(dialog));
    const b = makeExam("ex3");
    act(() => h.open(b));                                                                             // R2: exact fetch pending
    await tick();
    await bank.resolveSelect();
    expect(h.latest).toBe(b);
    expect(h.pastLength).toBe(0);
  });

  it("R3 — the target section is deleted while the exact fetch is pending: nothing is inserted anywhere, the teacher must pick a target again", async () => {
    const bank = fakeBank();
    render(<Host bank={bank.picker} />);
    await tick();
    const dialog = await openPicker(bank);
    await bank.resolveList();
    fireEvent.click(pick(dialog, "ما هو IP؟"));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "القسم الهدف" }), { target: { value: "s3" } });
    fireEvent.click(insertBtn(dialog));
    act(() => { if (h.latest) h.open({ ...h.latest, sections: h.latest.sections.filter(s => s.id !== "s3") } as StructuredExam); });   // s3 gone (same examId)
    await bank.resolveSelect();
    expect(allIds()).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(h.pastLength).toBe(0);
    expect(within(screen.getByRole("dialog", { name: "إضافة من بنك الأسئلة" })).getByRole("alert").textContent).toContain("القسم المستهدف لم يعد موجودًا");
    expect((within(screen.getByRole("dialog", { name: "إضافة من بنك الأسئلة" })).getByRole("combobox", { name: "القسم الهدف" }) as HTMLSelectElement).value).toBe("");
  });

  it("R3-race — the target disappears in the commit boundary: the exact fetch resolves after the newest exam COMMITTED but before any passive effect ran → still 'missing-target', nothing inserted, selection kept, retry = ONE step", async () => {
    const bank = fakeBank();
    render(<Host bank={bank.picker} />);
    await tick();
    const dialog = await openPicker(bank);
    await bank.resolveList();
    fireEvent.click(pick(dialog, "ما هو IP؟")); fireEvent.click(pick(dialog, "عرّف VLAN"));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "القسم الهدف" }), { target: { value: "s3" } });
    fireEvent.click(insertBtn(dialog));
    expect(bank.picker.select).toHaveBeenCalledTimes(1);
    const before = h.latest!;
    const without = { ...before, sections: before.sections.filter(s => s.id !== "s3") } as StructuredExam;
    // The race window. A NON-discrete update (no event, no act) is rendered and committed by React in a scheduler task;
    // the commit calls requestPaint(), so the scheduler yields and runs the passive effects (useEffect) in a LATER task.
    // Microtasks — the resolved exact fetch — run in between: the newest exam is on screen, useEffect has not run yet.
    const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const prevActEnv = g.IS_REACT_ACT_ENVIRONMENT;
    g.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      h.open(without);                                                                               // default lane: scheduled, not flushed
      // React queues its scheduler task from a microtask, so wait immediate-by-immediate until the commit is on screen. The
      // passive-effects task is queued DURING that commit, i.e. behind the immediate we are resuming from: still pending here.
      for (let i = 0; i < 50 && document.querySelectorAll(".sb-section").length !== 2; i++) await new Promise(r => setImmediate(r));
      expect(document.querySelectorAll(".sb-section")).toHaveLength(2);                              // the newest exam IS committed (s3 gone)
      expect(h.latest).toBe(before);                                                                 // ...and no passive effect has run yet (Host's mirror is stale)
      bank.selectCalls[0].d.resolve(bank.selectCalls[0].ids.map(canonical));                         // the fetch resolves inside the window
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();                     // insert() continues → onInsert(...)
    } finally {
      g.IS_REACT_ACT_ENVIRONMENT = prevActEnv;
    }
    await tick();                                                                                    // passive effects + any scheduled render
    expect(h.latest!.sections.map(s => s.id)).toEqual(["s1", "s2"]);
    expect(allIds()).toEqual(["q1", "q2", "q3", "q4", "q5"]);                                        // nothing inserted anywhere (no fallback)
    expect(h.pastLength).toBe(0);                                                                    // no partial history entry
    const stillOpen = screen.getByRole("dialog", { name: "إضافة من بنك الأسئلة" });                  // the picker did NOT report success
    expect(within(stillOpen).getByRole("alert").textContent).toContain("القسم المستهدف لم يعد موجودًا. اختر قسمًا آخر ثم أعد المحاولة.");
    expect((within(stillOpen).getByRole("combobox", { name: "القسم الهدف" }) as HTMLSelectElement).value).toBe("");
    expect(pick(stillOpen, "ما هو IP؟").checked).toBe(true); expect(pick(stillOpen, "عرّف VLAN").checked).toBe(true);   // selection preserved
    expect(insertBtn(stillOpen).textContent).toBe("إضافة 2 أسئلة");
    // Retry with a valid target: the full batch lands in ONE history step and the picker closes.
    fireEvent.change(within(stillOpen).getByRole("combobox", { name: "القسم الهدف" }), { target: { value: "s2" } });
    fireEvent.click(insertBtn(stillOpen));
    expect(bank.picker.select).toHaveBeenCalledTimes(2);
    expect(bank.selectCalls[1].ids).toEqual(["BANK-1", "BANK-4"]);
    await bank.resolveSelect();
    expect(h.latest!.sections[1].questions.map(q => (q as unknown as { bankQuestionId?: string }).bankQuestionId)).toEqual([undefined, undefined, "BANK-1", "BANK-4"]);
    expect(h.pastLength).toBe(1);
    expect(screen.queryByRole("dialog", { name: "إضافة من بنك الأسئلة" })).toBeNull();
    fireEvent.click(undoBtn());
    expect(h.latest!.sections[1].questions).toHaveLength(2);
  });

  it("D-RACE-1 — a selected bank question becomes used while the picker stays open: the row turns مضاف and is no longer actionable, the effective selection / count / insert label drop it, and inserting cannot create a duplicate", async () => {
    const bank = fakeBank();
    render(<Host bank={bank.picker} />);
    await tick();
    const dialog = await openPicker(bank);
    await bank.resolveList();
    fireEvent.click(pick(dialog, "ما هو IP؟")); fireEvent.click(pick(dialog, "عرّف VLAN"));
    expect(within(dialog).getByText("2 أسئلة محددة")).toBeTruthy();
    act(() => { if (h.latest) h.open(withBank(h.latest, "BANK-1")); });                              // independent owner update: BANK-1 is now in the exam
    await tick();
    const row = within(dialog).getByRole("row", { name: /ما هو IP؟/ });
    expect(within(row).getByText("مضاف")).toBeTruthy();
    expect(pick(dialog, "ما هو IP؟").disabled).toBe(true);
    expect(pick(dialog, "ما هو IP؟").checked).toBe(false);                                           // not actionable, not counted
    expect(within(dialog).getByText("1 أسئلة محددة")).toBeTruthy();
    expect(insertBtn(dialog).textContent).toBe("إضافة 1 أسئلة");
    fireEvent.click(insertBtn(dialog));
    expect(bank.picker.select).toHaveBeenCalledWith(["BANK-4"]);                                     // the used id is never submitted
    await bank.resolveSelect();
    await tick();
    expect(bankCount("BANK-1")).toBe(1); expect(bankCount("BANK-4")).toBe(1);
    expect(h.pastLength).toBe(1);
    expect(screen.queryByRole("dialog", { name: "إضافة من بنك الأسئلة" })).toBeNull();
  });

  it("D-RACE-2 — exact fetch pending, the id becomes used before the response: no second BANK-1, no partial batch, no history entry, the picker does not claim success and shows an actionable error; the rejected batch never reaches the history authority", async () => {
    const bank = fakeBank();
    render(<Host bank={bank.picker} />);
    await tick();
    const dialog = await openPicker(bank);
    await bank.resolveList();
    fireEvent.click(pick(dialog, "ما هو IP؟"));
    fireEvent.click(insertBtn(dialog));
    expect(bank.picker.select).toHaveBeenCalledWith(["BANK-1"]);
    act(() => { if (h.latest) h.open(withBank(h.latest, "BANK-1")); });                              // same exam, now contains BANK-1
    await tick();
    const calls = h.updateCalls;
    await bank.resolveSelect();
    await tick();
    expect(bankCount("BANK-1")).toBe(1);
    expect(h.pastLength).toBe(0);
    expect(h.updateCalls).toBe(calls);                                                               // known-invalid against the committed authority → never dispatched
    const stillOpen = screen.getByRole("dialog", { name: "إضافة من بنك الأسئلة" });
    expect(within(stillOpen).getByRole("alert").textContent).toContain(ALREADY_USED);
    expect(within(stillOpen).getByText("0 أسئلة محددة")).toBeTruthy();                                // BANK-1 is no longer selectable
    expect(pick(stillOpen, "ما هو IP؟").disabled).toBe(true);
  });

  it("D-RACE-3 — mixed batch stays atomic: BANK-1 becomes used while the fetch for [BANK-1, BANK-2] is pending → BANK-2 is NOT inserted alone, nothing changes except the independent update, no history entry, BANK-2 stays selected for retry", async () => {
    const bank = fakeBank();
    render(<Host bank={bank.picker} />);
    await tick();
    const dialog = await openPicker(bank);
    await bank.resolveList();
    fireEvent.click(pick(dialog, "ما هو IP؟")); fireEvent.click(pick(dialog, "أكمل القناع ____"));
    fireEvent.click(insertBtn(dialog));
    expect(bank.picker.select).toHaveBeenCalledWith(["BANK-1", "BANK-2"]);
    act(() => { if (h.latest) h.open(withBank(h.latest, "BANK-1")); });
    await tick();
    const snapshot = h.latest!;
    await bank.resolveSelect();
    await tick();
    expect(h.latest).toBe(snapshot);                                                                 // untouched (same reference)
    expect(bankCount("BANK-1")).toBe(1); expect(bankCount("BANK-2")).toBe(0);
    expect(h.pastLength).toBe(0);
    const stillOpen = screen.getByRole("dialog", { name: "إضافة من بنك الأسئلة" });
    expect(within(stillOpen).getByRole("alert").textContent).toContain(ALREADY_USED);
    expect(pick(stillOpen, "أكمل القناع ____").checked).toBe(true);
    expect(within(stillOpen).getByText("1 أسئلة محددة")).toBeTruthy();
    // Retry inserts only the still-valid remainder as ONE step.
    fireEvent.click(insertBtn(stillOpen));
    expect(bank.selectCalls[1].ids).toEqual(["BANK-2"]);
    await bank.resolveSelect();
    await tick();
    expect(bankCount("BANK-2")).toBe(1); expect(bankCount("BANK-1")).toBe(1);
    expect(h.pastLength).toBe(1);
  });

  it("D-RACE-4 — inner updater guard: the outer check is stale (the update that brings BANK-1 in is ENQUEUED but not yet committed when the fetch resolves) → the functional updater returns prev, no duplicate, no partial insertion, and the picker does NOT claim success", async () => {
    const bank = fakeBank();
    render(<Host bank={bank.picker} />);
    await tick();
    const dialog = await openPicker(bank);
    await bank.resolveList();
    fireEvent.click(pick(dialog, "ما هو IP؟")); fireEvent.click(pick(dialog, "عرّف VLAN"));
    fireEvent.click(insertBtn(dialog));
    const before = h.latest!;
    const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const prevActEnv = g.IS_REACT_ACT_ENVIRONMENT;
    g.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      // Same synchronous block, outside act: the fetch continuation is a microtask that runs AFTER this block, so when
      // onInsert runs, the committed authority still lacks BANK-1 (outer check passes) while the owner update that adds
      // BANK-1 is already queued ahead of the insertion updater → only the updater's own re-check can protect the exam.
      bank.selectCalls[0].d.resolve(bank.selectCalls[0].ids.map(canonical));
      h.open(withBank(before, "BANK-1"));
      for (let i = 0; i < 50 && h.latest === before; i++) await new Promise(r => setImmediate(r));
      for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    } finally {
      g.IS_REACT_ACT_ENVIRONMENT = prevActEnv;
    }
    await tick();
    expect(bankCount("BANK-1")).toBe(1);                                                             // no duplicate
    expect(bankCount("BANK-4")).toBe(0);                                                             // no partial insertion
    expect(h.pastLength).toBe(0);
    const stillOpen = screen.getByRole("dialog", { name: "إضافة من بنك الأسئلة" });                  // no false success
    expect(within(stillOpen).getByRole("alert").textContent).toContain(ALREADY_USED);
    expect(pick(stillOpen, "عرّف VLAN").checked).toBe(true);
    expect(within(stillOpen).getByText("1 أسئلة محددة")).toBeTruthy();
  });

  it("no picker action is offered without an App-owned bank service; a failed bank load shows an error with retry ", async () => {
    render(<Host />);
    await tick();
    expect(screen.queryByRole("button", { name: /إضافة من بنك الأسئلة/ })).toBeNull();
    cleanup();
    const bank = fakeBank();
    render(<Host bank={bank.picker} />);
    await tick();
    const dialog = await openPicker(bank);
    await act(async () => { bank.listCalls[0].reject(new Error("HTTP 500")); });
    expect(within(dialog).getByRole("alert").textContent).toContain("HTTP 500");
    fireEvent.click(within(dialog).getByRole("button", { name: "إعادة المحاولة" }));
    await bank.resolveList();
    expect(within(dialog).getAllByRole("row").slice(1)).toHaveLength(4);
  });
});

describe("F — narrow viewports (mobile / RTL)", () => {
  it("the navigator opens as a dialog instead of a side panel; a jump closes it and focuses the REAL card", async () => {
    const original = window.matchMedia;
    const listeners = new Set<() => void>();
    (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({ matches: q.includes("max-width: 900px"), media: q, addEventListener: (_: string, l: () => void) => { listeners.add(l); }, removeEventListener: (_: string, l: () => void) => { listeners.delete(l); } });
    try {
      render(<Host />);
      await tick();
      fireEvent.click(navBtn());
      await tick();
      expect(screen.queryByRole("complementary", { name: "مستكشف الأسئلة" })).toBeNull();
      const dialog = screen.getByRole("dialog", { name: "مستكشف الأسئلة" });
      expect(navBtn().getAttribute("aria-pressed")).toBe("true");
      expect(navBtn().getAttribute("aria-controls")).toBeNull();                                       // nothing inline to control
      expect(within(dialog).getAllByRole("group")).toHaveLength(3);
      (HTMLElement.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
      fireEvent.click(within(dialog).getByRole("button", { name: /جدار الحماية/ }));
      await tick();                                                                                    // the dialog releases focus first, then the card is focused
      expect(screen.queryByRole("dialog", { name: "مستكشف الأسئلة" })).toBeNull();
      expect(document.activeElement).toBe(card("q4"));
      expect(card("q4").classList.contains("sb-q-flash")).toBe(true);
      expect(h.dirty).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });
});
