// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ExamBankPage from "./ExamBankPage";
import { filterRows, summarize, validateInput, inputFromRow, emptyInput, structureForType, newRequestKey, type BankQuestionRow } from "./bankQuestionModel";

// UX-6c — Exam Bank Management page: request discipline (one bank load + one saved-exam load on entry, nothing for
// tabs/search/filters/preview), the question bank list/search/filters, add/edit/delete with confirmation and
// server-authoritative local updates, failed mutations leaving state intact, out-of-order load safety, saved
// exams through the existing contract, and the official library as read-only.

const row = (id: string, over: Partial<BankQuestionRow> = {}): BankQuestionRow => ({
  id, sourceId: "import-quiz-20260301-abc123", sourceKind: "import", official: false, questionNumber: "1", section: "BASIC", topic: "NETWORK_BASICS", difficulty: 2, difficultyLabel: "",
  type: "multipleChoice", presentationType: "multipleChoice", text: "ما هو الراوتر؟", options: [{ value: "a", text: "جهاز توجيه" }, { value: "b", text: "كابل" }], fields: [], wordBank: [],
  answer: { mode: "singleChoice", correctOptionValue: "a", values: ["a"] }, hasImage: false, reviewStatus: "classified", createdAt: "2026-03-01T10:00:00.000Z", updatedAt: "2026-03-01T10:00:00.000Z", ...over
});
const OFFICIAL = row("791381-2025-exam-q1", { sourceId: "791381-2025-exam", sourceKind: "official", official: true, text: "ما هو IP؟", topic: "IP_ADDRESSING", difficulty: 1, options: [{ value: "A", text: "بروتوكول" }, { value: "B", text: "كابل" }], answer: { mode: "singleChoice", correctOptionValue: "A", values: ["A"] } });
const IMPORTED = row("import-quiz-20260301-abc123-1", { text: "عرّف VLAN", topic: "SWITCHING", difficulty: 3, presentationType: "open", type: "shortAnswer", options: [], answer: { mode: "manual", values: [] }, reviewStatus: "pending-classification" });
const MANUAL = row("manual-x1", { sourceId: "manual", sourceKind: "manual", text: "أكمل: قناع الشبكة الافتراضي للفئة C هو ____", section: "INFRASTRUCTURE", topic: "SUBNETTING", difficulty: null, presentationType: "fillBlank", type: "multiField", options: [], fields: [{ id: "f1", label: "القناع", correct: "255.255.255.0" }], answer: { mode: "exactSequence", values: ["255.255.255.0"] } });
const WORD = row("manual-w1", { sourceId: "manual", sourceKind: "manual", text: "اختر البروتوكول: ____ يعتمد الحالة", section: "BASIC", topic: "ROUTING", difficulty: 2, presentationType: "wordBank", type: "multiField", options: [], fields: [{ id: "f1", label: "الأول", correct: "OSPF" }], wordBank: ["OSPF", "RIP", "BGP"], answer: { mode: "exactSequence", values: ["OSPF"] } });
const ROWS = [OFFICIAL, IMPORTED, MANUAL];
const EXAMS = [{ blobName: "exams/e1.json", examId: "e1", title: "امتحان الفصل الأول", savedAt: "2026-03-02T09:00:00.000Z", questionCount: 12, totalMarks: 100 }];
const CATALOG = [{ libraryItemId: "L1", title: "شبكات VLAN", questionCount: 6, totalMarks: 60, publishable: true }, { libraryItemId: "L2", title: "DHCP متقدم", questionCount: 3, totalMarks: 30, publishable: false }];

type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[] = [];
let bankResponder: (() => Promise<Response>) | null = null;
let mutationFail = false;
const json = (data: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => data } as Response);
function routed(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input); const method = (init?.method || "GET").toUpperCase();
  let body: Record<string, unknown> = {}; if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { /* ignore */ } }
  calls.push({ url, method, body });
  if (url === "/api/bank-questions" && method === "GET") return bankResponder ? bankResponder() : json({ ok: true, questions: ROWS });
  if (url === "/api/bank-questions") {
    if (mutationFail) return json({ ok: false, error: "تعذر تنفيذ العملية على بنك الأسئلة حاليًا." }, 500);
    const q = body.question as Record<string, unknown> | undefined;
    if (body.action === "create") return json({ ok: true, question: row("manual-new-1", { sourceId: "manual", sourceKind: "manual", text: String(q?.text), topic: String(q?.topic), section: q?.section as "BASIC", difficulty: Number(q?.difficulty), presentationType: q?.presentationType as "fillBlank", fields: (q?.fields as BankQuestionRow["fields"]) || [], wordBank: (q?.wordBank as string[]) || [], createdAt: "2026-09-17T12:00:00.000Z", updatedAt: "2026-09-17T12:00:00.000Z" }) });
    if (body.action === "update") return json({ ok: true, question: row(String(body.id), { ...(ROWS.find(r => r.id === body.id) || {}), text: String(q?.text), topic: String(q?.topic), updatedAt: "2026-09-17T12:00:00.000Z" }) });
    if (body.action === "delete") return json({ ok: true, deleted: true, id: body.id });
  }
  if (url === "/api/saved-exams" && method === "GET") return json({ ok: true, exams: EXAMS });
  if (url === "/api/saved-exams") return mutationFail ? json({ ok: false, error: "تعذر" }, 500) : json({ ok: true, deleted: true });
  if (url === "/api/exam-library") return json({ ok: true, catalog: CATALOG });
  if (url.startsWith("/api/exam-library/")) return json({ ok: true, item: { examSnapshot: { title: "شبكات VLAN", questions: [{ examQuestionId: "lq1", text: "س", marks: 10 }] } } });
  return json({ ok: true });
}
const gets = (path: string) => calls.filter(c => c.method === "GET" && c.url === path).length;
const posts = () => calls.filter(c => c.method === "POST");
let props: { onOpenBuilder: ReturnType<typeof vi.fn<() => void>>; onOpenImport: ReturnType<typeof vi.fn<() => void>>; onOpenSavedExam: ReturnType<typeof vi.fn<(item: unknown) => void>>; onCopyLibraryExamToBuilder: ReturnType<typeof vi.fn<(snapshot: unknown, title: string) => void>> };

beforeEach(() => {
  calls = []; bankResponder = null; mutationFail = false;
  globalThis.fetch = vi.fn(routed) as unknown as typeof fetch;
  props = { onOpenBuilder: vi.fn<() => void>(), onOpenImport: vi.fn<() => void>(), onOpenSavedExam: vi.fn<(item: unknown) => void>(), onCopyLibraryExamToBuilder: vi.fn<(snapshot: unknown, title: string) => void>() };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount() {
  render(<ExamBankPage token="t" {...props} />);
  await screen.findByText("عدد الأسئلة");
  await waitFor(() => expect(screen.getByText("عدد الأسئلة").closest(".eb-stat-card")?.textContent).toContain("3"));
  await waitFor(() => expect(screen.getByText("الامتحانات المحفوظة", { selector: ".eb-stat-label" }).closest(".eb-stat-card")?.textContent).toContain("1"));
}
const tabs = () => screen.getByRole("group", { name: "أقسام بنك الامتحانات" });
const openTab = (label: string) => fireEvent.click(within(tabs()).getByRole("button", { name: label }));
const rowOf = (text: string) => screen.getByText(text).closest("tr") as HTMLElement;
const table = () => document.querySelector(".eb-bank-table") as HTMLElement | null;
const rowCount = () => table()?.querySelectorAll("tbody tr").length ?? 0;
const confirmEl = () => waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm"); return el; });

describe("pure model", () => {
  it("filters by text/topic/id, section, type, difficulty and source with zero-vs-missing difficulty kept distinct", () => {
    const rows = [OFFICIAL, IMPORTED, MANUAL, row("z0", { difficulty: 0 })];
    const f = (over: Record<string, string>) => filterRows(rows, { q: "", section: "", type: "", difficulty: "", source: "", ...over }).map(r => r.id);
    expect(f({ q: "vlan" })).toEqual([IMPORTED.id]);
    expect(f({ q: "SUBNET" })).toEqual([MANUAL.id]);
    expect(f({ q: "manual-x1" })).toEqual([MANUAL.id]);
    expect(f({ section: "INFRASTRUCTURE" })).toEqual([MANUAL.id]);
    expect(f({ type: "open" })).toEqual([IMPORTED.id]);
    expect(f({ difficulty: "0" })).toEqual(["z0"]);                        // 0 is a value, not "missing"
    expect(f({ source: "official" })).toEqual([OFFICIAL.id]);
    expect(f({ q: "لا يوجد" })).toEqual([]);
  });
  it("summarize counts sections, types, difficulties (null → غير محدد), topics, official vs editable, pending", () => {
    const s = summarize(ROWS);
    expect(s).toMatchObject({ total: 3, editable: 2, official: 1, pendingClassification: 1 });
    expect(s.bySection).toEqual({ BASIC: 2, INFRASTRUCTURE: 1 });
    expect(s.byType).toEqual({ multipleChoice: 1, open: 1, fillBlank: 1 });
    expect(s.byDifficulty).toEqual({ "1": 1, "3": 1, "—": 1 });
    expect(s.byTopic[0]).toEqual({ topic: "IP_ADDRESSING", count: 1 });
    expect(summarize([])).toMatchObject({ total: 0, editable: 0, official: 0 });
  });
  it("validateInput mirrors the server rules; inputFromRow round-trips an MC and a fill-blank row", () => {
    expect(validateInput(emptyInput())).toEqual(["نص السؤال مطلوب.", "الموضوع مطلوب.", "الخيار 1 بلا نص.", "الخيار 2 بلا نص.", "حدّد الإجابة الصحيحة من بين الخيارات."]);
    expect(validateInput(inputFromRow(OFFICIAL))).toEqual([]);
    expect(inputFromRow(OFFICIAL).answer).toEqual({ correctOptionValue: "A" });
    expect(inputFromRow(MANUAL)).toEqual({ section: "INFRASTRUCTURE", topic: "SUBNETTING", difficulty: 3, presentationType: "fillBlank", text: MANUAL.text, options: [], fields: [{ id: "f1", label: "القناع", correct: "255.255.255.0" }], wordBank: [], answer: {} });
    expect(inputFromRow(WORD)).toMatchObject({ presentationType: "wordBank", fields: [{ id: "f1", label: "الأول", correct: "OSPF" }], wordBank: ["OSPF", "RIP", "BGP"], answer: {} });
    expect(validateInput(inputFromRow(MANUAL))).toEqual([]); expect(validateInput(inputFromRow(WORD))).toEqual([]);
    // an older multiField row without expected values on its fields shows the answer sequence at the same position
    expect(inputFromRow({ ...MANUAL, fields: [{ id: "f1", label: "", correct: "" }] }).fields).toEqual([{ id: "f1", label: "", correct: "255.255.255.0" }]);
    expect(validateInput({ ...inputFromRow(WORD), fields: [{ id: "f1", label: "", correct: "" }] })).toEqual(["الفراغ 1 بلا إجابة صحيحة."]);
    expect(validateInput({ ...inputFromRow(WORD), wordBank: ["RIP", "BGP"] })).toEqual(["الإجابة الصحيحة للفراغ 1 غير موجودة في بنك الكلمات."]);
    expect(validateInput({ ...inputFromRow(WORD), wordBank: ["OSPF"] })).toEqual(["بنك الكلمات يحتاج كلمتين مختلفتين على الأقل."]);
    expect(validateInput({ ...inputFromRow(MANUAL), fields: [] })).toEqual(["أضف فراغًا واحدًا على الأقل."]);
    // type switching rebuilds the structure: nothing from the previous type survives into the new payload
    const mc = inputFromRow(OFFICIAL);
    expect(structureForType(mc, "fillBlank")).toMatchObject({ presentationType: "fillBlank", options: [], wordBank: [], answer: {} });
    expect(structureForType(mc, "fillBlank").fields).toHaveLength(1);
    expect(structureForType(inputFromRow(WORD), "fillBlank")).toMatchObject({ presentationType: "fillBlank", fields: [{ id: "f1", label: "الأول", correct: "OSPF" }], wordBank: [], options: [] });   // blanks carry over, the bank does not
    expect(structureForType(inputFromRow(MANUAL), "wordBank")).toMatchObject({ presentationType: "wordBank", fields: [{ id: "f1", label: "القناع", correct: "255.255.255.0" }], wordBank: [], options: [] });
    expect(structureForType(inputFromRow(WORD), "multipleChoice")).toMatchObject({ presentationType: "multipleChoice", fields: [], wordBank: [], options: [{ value: "a", text: "" }, { value: "b", text: "" }], answer: { correctOptionValue: "" } });
    expect(structureForType(inputFromRow(WORD), "open")).toMatchObject({ presentationType: "open", fields: [], wordBank: [], options: [], answer: { values: [] } });
    expect(structureForType(inputFromRow(IMPORTED), "wordBank").fields).toHaveLength(1);
    expect(newRequestKey()).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/);
  });
});

describe("entry and request discipline", () => {
  it("entering the page issues exactly one bank load and one saved-exam list load; tabs, search, filters and preview issue nothing", async () => {
    await mount();
    expect(gets("/api/bank-questions")).toBe(1); expect(gets("/api/saved-exams")).toBe(1); expect(calls).toHaveLength(2);
    openTab("بنك الأسئلة");
    expect(rowCount()).toBe(3);
    fireEvent.change(screen.getByLabelText("ابحث في نص السؤال أو الموضوع أو المعرّف"), { target: { value: "VLAN" } });
    expect(rowCount()).toBe(1);
    fireEvent.change(screen.getByLabelText("القسم"), { target: { value: "INFRASTRUCTURE" } });
    expect(rowCount()).toBe(0);
    expect(screen.getByText("لا توجد أسئلة مطابقة.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "مسح التصفية" }));
    expect(rowCount()).toBe(3);
    fireEvent.change(screen.getByLabelText("المصدر"), { target: { value: "official" } });
    expect(rowCount()).toBe(1);
    fireEvent.change(screen.getByLabelText("المصدر"), { target: { value: "" } });
    fireEvent.click(within(rowOf("عرّف VLAN")).getByRole("button", { name: "معاينة" }));
    const dialog = await screen.findByRole("dialog", { name: "معاينة السؤال" });
    expect(dialog.textContent).toContain("التصحيح يدوي");
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق المعاينة" }));
    openTab("نظرة عامة"); openTab("الامتحانات المحفوظة");
    expect(calls).toHaveLength(2);                                          // still only the two entry loads
  });
  it("overview counts come from the loaded data (Western digits) and the primary actions route to the builder / import / add-question dialog", async () => {
    await mount();
    expect(screen.getByText("قابلة للتعديل").closest(".eb-stat-card")?.textContent).toContain("2");
    expect(screen.getByText("أسئلة رسمية").closest(".eb-stat-card")?.textContent).toContain("1");
    expect(screen.getByText("بانتظار التصنيف").closest(".eb-stat-card")?.textContent).toContain("1");
    expect(screen.getByText("حسب الصعوبة").parentElement?.textContent).toContain("غير محدد1");
    fireEvent.click(screen.getByRole("button", { name: "إنشاء امتحان جديد" }));
    expect(props.onOpenBuilder).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "استيراد أسئلة" }));
    expect(props.onOpenImport).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "إضافة سؤال" }));
    await screen.findByRole("dialog", { name: "إضافة سؤال إلى البنك" });
    expect(calls).toHaveLength(2);
  });
  it("the list renders official questions read-only (badge, preview only) and editable ones with edit/delete; MC preview marks the correct option", async () => {
    await mount(); openTab("بنك الأسئلة");
    const official = rowOf("ما هو IP؟");
    expect(within(official).getByText(/رسمي/)).toBeTruthy();
    expect(within(official).queryByRole("button", { name: "تعديل" })).toBeNull();
    expect(within(official).queryByRole("button", { name: "حذف" })).toBeNull();
    expect(within(rowOf("عرّف VLAN")).getByRole("button", { name: "تعديل" })).toBeTruthy();
    expect(within(rowOf("عرّف VLAN")).getByRole("button", { name: "حذف" })).toBeTruthy();
    expect(within(rowOf(MANUAL.text)).getAllByRole("cell")[4].textContent).toBe("—");   // null difficulty
    expect(within(official).getAllByRole("cell")[4].textContent).toBe("1");
    fireEvent.click(within(official).getByRole("button", { name: "معاينة" }));
    const dialog = await screen.findByRole("dialog", { name: "معاينة السؤال" });
    expect(within(dialog).getByText(/بروتوكول/).className).toContain("is-correct");
    expect(within(dialog).queryByRole("button", { name: "تعديل" })).toBeNull();          // no edit path for official
  });
});

describe("CRUD", () => {
  it("add: validation blocks an empty submit with no request; a valid submit posts exactly one create and the authoritative row appears first", async () => {
    await mount(); openTab("بنك الأسئلة");
    fireEvent.click(screen.getByRole("button", { name: "إضافة سؤال" }));
    const dialog = await screen.findByRole("dialog", { name: "إضافة سؤال إلى البنك" });
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة السؤال" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("نص السؤال مطلوب.");
    expect(within(dialog).getByLabelText("نص السؤال").getAttribute("aria-invalid")).toBe("true");
    expect(posts()).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText("نص السؤال"), { target: { value: "ما هو السويتش؟" } });
    fireEvent.change(within(dialog).getByLabelText("الموضوع"), { target: { value: "SWITCHING" } });
    fireEvent.change(within(dialog).getByLabelText("نص الخيار 1"), { target: { value: "جهاز تبديل" } });
    fireEvent.change(within(dialog).getByLabelText("نص الخيار 2"), { target: { value: "كابل" } });
    fireEvent.click(within(dialog).getByLabelText("الخيار 1 هو الإجابة الصحيحة"));
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة السؤال" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "إضافة سؤال إلى البنك" })).toBeNull());
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toMatchObject({ action: "create", question: { text: "ما هو السويتش؟", topic: "SWITCHING", section: "BASIC", difficulty: 3, presentationType: "multipleChoice", answer: { correctOptionValue: "a" }, fields: [], wordBank: [] } });
    expect(String(posts()[0].body.requestKey)).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/);
    expect(rowCount()).toBe(4);
    expect(table()?.querySelector("tbody tr")?.textContent).toContain("ما هو السويتش؟");
    expect(screen.getByRole("status").textContent).toContain("تمت إضافة السؤال");
    expect(gets("/api/bank-questions")).toBe(1);                                          // no refetch after the mutation
  });
  it("edit: the form starts from the stored values; save posts one update and the row shows the server's answer", async () => {
    await mount(); openTab("بنك الأسئلة");
    fireEvent.click(within(rowOf("عرّف VLAN")).getByRole("button", { name: "تعديل" }));
    const dialog = await screen.findByRole("dialog", { name: "تعديل السؤال" });
    expect((within(dialog).getByLabelText("نص السؤال") as HTMLTextAreaElement).value).toBe("عرّف VLAN");
    expect((within(dialog).getByLabelText("نوع السؤال") as HTMLSelectElement).value).toBe("open");
    fireEvent.change(within(dialog).getByLabelText("نص السؤال"), { target: { value: "عرّف VLAN مع مثال" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ التعديلات" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "تعديل السؤال" })).toBeNull());
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toMatchObject({ action: "update", id: IMPORTED.id, question: { text: "عرّف VLAN مع مثال", presentationType: "open", answer: { values: [] } } });
    expect(rowCount()).toBe(3);
    expect(screen.getByText("عرّف VLAN مع مثال")).toBeTruthy();
    expect(screen.queryByText("عرّف VLAN")).toBeNull();
  });
  it("delete: requires confirmation; cancel sends nothing; confirm sends exactly one delete, removes the row and moves focus to the list heading", async () => {
    await mount(); openTab("بنك الأسئلة");
    fireEvent.click(within(rowOf("عرّف VLAN")).getByRole("button", { name: "حذف" }));
    let d = await confirmEl();
    expect(d.textContent).toContain("سيُحذف هذا السؤال نهائيًا");
    fireEvent.click(within(d).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(document.querySelector('.eb-confirm[role="dialog"]')).toBeNull());
    expect(posts()).toHaveLength(0); expect(rowCount()).toBe(3);
    fireEvent.click(within(rowOf("عرّف VLAN")).getByRole("button", { name: "حذف" }));
    d = await confirmEl();
    fireEvent.click(within(d).getByRole("button", { name: "حذف نهائي" }));
    await waitFor(() => expect(rowCount()).toBe(2));
    expect(posts()).toEqual([expect.objectContaining({ body: { action: "delete", id: IMPORTED.id } })]);
    expect(screen.queryByText("عرّف VLAN")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("تم حذف السؤال");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "قائمة الأسئلة" })));
  });
  it("add a word-bank question: switching type shows blanks + the word bank; the payload carries fields with expected values and the choices, no options; validation names the missing choice", async () => {
    await mount(); openTab("بنك الأسئلة");
    fireEvent.click(screen.getByRole("button", { name: "إضافة سؤال" }));
    const dialog = await screen.findByRole("dialog", { name: "إضافة سؤال إلى البنك" });
    fireEvent.change(within(dialog).getByLabelText("نوع السؤال"), { target: { value: "wordBank" } });
    expect(within(dialog).queryByLabelText("نص الخيار 1")).toBeNull();                                  // MC structure gone
    expect(within(dialog).getByLabelText("عنوان الفراغ 1")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("نص السؤال"), { target: { value: "اختر: ____ يعتمد الحالة، ____ يعتمد المسافة" } });
    fireEvent.change(within(dialog).getByLabelText("الموضوع"), { target: { value: "ROUTING" } });
    fireEvent.change(within(dialog).getByLabelText("عنوان الفراغ 1"), { target: { value: "الأول" } });
    fireEvent.change(within(dialog).getByLabelText("الإجابة الصحيحة للفراغ 1"), { target: { value: "OSPF" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة فراغ" }));
    fireEvent.change(within(dialog).getByLabelText("الإجابة الصحيحة للفراغ 2"), { target: { value: "RIP" } });
    fireEvent.change(within(dialog).getByLabelText(/بنك الكلمات/), { target: { value: "OSPF\nBGP\n" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة السؤال" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("الإجابة الصحيحة للفراغ 2 غير موجودة في بنك الكلمات.");
    expect(posts()).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText(/بنك الكلمات/), { target: { value: "OSPF\nBGP\nRIP\nOSPF" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة السؤال" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "إضافة سؤال إلى البنك" })).toBeNull());
    expect(posts()).toHaveLength(1);
    const q = posts()[0].body.question as Record<string, unknown>;
    expect(q).toMatchObject({ presentationType: "wordBank", options: [], wordBank: ["OSPF", "BGP", "RIP"], answer: {} });
    expect((q.fields as { label: string; correct: string }[]).map(f => [f.label, f.correct])).toEqual([["الأول", "OSPF"], ["", "RIP"]]);
    expect(table()?.querySelector("tbody tr")?.textContent).toContain("بنك كلمات");
    fireEvent.click(within(table()?.querySelector("tbody tr") as HTMLElement).getByRole("button", { name: "معاينة" }));
    const preview = await screen.findByRole("dialog", { name: "معاينة السؤال" });
    expect(within(preview).getByText("بنك الكلمات: OSPF · BGP · RIP")).toBeTruthy();
    expect(within(preview).getByRole("list", { name: "الفراغات" }).textContent).toContain("الأول: OSPF");
  });
  it("edit a fill-blank question: the form starts from its blanks; switching to multiple choice drops them and the update carries only options", async () => {
    await mount(); openTab("بنك الأسئلة");
    fireEvent.click(within(rowOf(MANUAL.text)).getByRole("button", { name: "تعديل" }));
    const dialog = await screen.findByRole("dialog", { name: "تعديل السؤال" });
    expect((within(dialog).getByLabelText("نوع السؤال") as HTMLSelectElement).value).toBe("fillBlank");
    expect((within(dialog).getByLabelText("عنوان الفراغ 1") as HTMLInputElement).value).toBe("القناع");
    expect((within(dialog).getByLabelText("الإجابة الصحيحة للفراغ 1") as HTMLInputElement).value).toBe("255.255.255.0");
    expect(within(dialog).queryByLabelText(/بنك الكلمات/)).toBeNull();                                  // fill-blank has no word bank
    fireEvent.change(within(dialog).getByLabelText("الإجابة الصحيحة للفراغ 1"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ التعديلات" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("الفراغ 1 بلا إجابة صحيحة.");
    expect(posts()).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText("نوع السؤال"), { target: { value: "multipleChoice" } });
    expect(within(dialog).queryByLabelText("عنوان الفراغ 1")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("نص الخيار 1"), { target: { value: "255.255.255.0" } });
    fireEvent.change(within(dialog).getByLabelText("نص الخيار 2"), { target: { value: "255.255.0.0" } });
    fireEvent.click(within(dialog).getByLabelText("الخيار 1 هو الإجابة الصحيحة"));
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ التعديلات" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "تعديل السؤال" })).toBeNull());
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toMatchObject({ action: "update", id: MANUAL.id, question: { presentationType: "multipleChoice", fields: [], wordBank: [], answer: { correctOptionValue: "a" } } });
    expect((posts()[0].body.question as { options: unknown[] }).options).toHaveLength(2);
    expect(posts()[0].body.requestKey).toBeUndefined();                                                   // only create carries a key
  });
  it("a create that fails and is retried from the same form sends the SAME requestKey (the server reconciles instead of storing a second copy)", async () => {
    await mount(); openTab("بنك الأسئلة");
    fireEvent.click(screen.getByRole("button", { name: "إضافة سؤال" }));
    const dialog = await screen.findByRole("dialog", { name: "إضافة سؤال إلى البنك" });
    fireEvent.change(within(dialog).getByLabelText("نص السؤال"), { target: { value: "ما هو السويتش؟" } });
    fireEvent.change(within(dialog).getByLabelText("الموضوع"), { target: { value: "SWITCHING" } });
    fireEvent.change(within(dialog).getByLabelText("نص الخيار 1"), { target: { value: "جهاز تبديل" } });
    fireEvent.change(within(dialog).getByLabelText("نص الخيار 2"), { target: { value: "كابل" } });
    fireEvent.click(within(dialog).getByLabelText("الخيار 1 هو الإجابة الصحيحة"));
    mutationFail = true;
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة السؤال" }));
    await within(dialog).findByRole("alert");
    expect(rowCount()).toBe(3);
    mutationFail = false;
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة السؤال" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "إضافة سؤال إلى البنك" })).toBeNull());
    expect(posts()).toHaveLength(2);
    expect(posts()[0].body.requestKey).toBeTruthy();
    expect(posts()[1].body.requestKey).toBe(posts()[0].body.requestKey);
    expect(rowCount()).toBe(4);
  });
  it("a failed update shows the server error inside the still-open dialog and leaves the list untouched; a failed delete keeps the row", async () => {
    await mount(); openTab("بنك الأسئلة");
    mutationFail = true;
    fireEvent.click(within(rowOf("عرّف VLAN")).getByRole("button", { name: "تعديل" }));
    const dialog = await screen.findByRole("dialog", { name: "تعديل السؤال" });
    fireEvent.change(within(dialog).getByLabelText("نص السؤال"), { target: { value: "نص جديد" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ التعديلات" }));
    await within(dialog).findByRole("alert");
    expect(within(dialog).getByRole("alert").textContent).toContain("تعذر تنفيذ العملية");
    expect(screen.getByRole("dialog", { name: "تعديل السؤال" })).toBeTruthy();
    expect(table()?.textContent).not.toContain("نص جديد");                             // no fake local edit
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "تعديل السؤال" })).toBeNull());
    expect(screen.getByText("عرّف VLAN")).toBeTruthy();
    fireEvent.click(within(rowOf("عرّف VLAN")).getByRole("button", { name: "حذف" }));
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "حذف نهائي" }));
    await screen.findAllByRole("alert");
    expect(rowCount()).toBe(3);
    expect(posts()).toHaveLength(2);                                                     // one failed update + one failed delete, no retries
  });
  it("a stale (out-of-order) bank response never overwrites a newer one", async () => {
    const pending: Array<(v: Response) => void> = [];
    bankResponder = () => new Promise<Response>(resolve => { pending.push(resolve); });
    render(<ExamBankPage token="t" {...props} />);
    await waitFor(() => expect(pending).toHaveLength(1));
    openTab("بنك الأسئلة");
    fireEvent.click(screen.getByRole("button", { name: "تحديث" }));
    await waitFor(() => expect(pending).toHaveLength(2));
    pending[1]({ ok: true, status: 200, json: async () => ({ ok: true, questions: [MANUAL] }) } as Response);   // newer request answers first
    await waitFor(() => expect(rowCount()).toBe(1));
    pending[0]({ ok: true, status: 200, json: async () => ({ ok: true, questions: ROWS }) } as Response);        // older request answers late
    await new Promise(r => setTimeout(r, 20));
    expect(rowCount()).toBe(1);
    expect(screen.getByText(MANUAL.text)).toBeTruthy();
    expect(screen.queryByRole("status", { name: "" })?.textContent ?? "").not.toContain("جارٍ تحميل");
  });
});

describe("saved exams and official library", () => {
  it("saved exams use the existing contract: list, open in the builder, delete after confirmation (one POST)", async () => {
    await mount(); openTab("الامتحانات المحفوظة");
    const item = screen.getByText("امتحان الفصل الأول").closest("li") as HTMLElement;
    expect(item.textContent).toContain("12 سؤال");
    fireEvent.click(within(item).getByRole("button", { name: "فتح في الباني" }));
    expect(props.onOpenSavedExam).toHaveBeenCalledWith(EXAMS[0]);
    fireEvent.click(within(item).getByRole("button", { name: "حذف" }));
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "حذف" }));
    await waitFor(() => expect(screen.queryByText("امتحان الفصل الأول")).toBeNull());
    expect(posts()).toEqual([expect.objectContaining({ url: "/api/saved-exams", body: { action: "delete", blobName: "exams/e1.json" } })]);
    expect(screen.getByText("لا توجد امتحانات محفوظة بعد.")).toBeTruthy();
  });
  it("the official library loads once on first open, exposes no edit/delete, and opening a copy fetches the item then hands it to the builder", async () => {
    await mount();
    openTab("المكتبة الرسمية");
    await screen.findByText("شبكات VLAN");
    expect(gets("/api/exam-library")).toBe(1);
    openTab("نظرة عامة"); openTab("المكتبة الرسمية");
    expect(gets("/api/exam-library")).toBe(1);                                           // cached after the first open
    const item = screen.getByText("شبكات VLAN").closest("li") as HTMLElement;
    expect(within(item).getByText(/للقراءة فقط/)).toBeTruthy();
    expect(within(item).queryByRole("button", { name: /تعديل|حذف/ })).toBeNull();
    expect(within(screen.getByText("DHCP متقدم").closest("li") as HTMLElement).getByText("يحتاج مراجعة")).toBeTruthy();
    fireEvent.click(within(item).getByRole("button", { name: "فتح نسخة في الباني" }));
    await waitFor(() => expect(props.onCopyLibraryExamToBuilder).toHaveBeenCalledTimes(1));
    expect(props.onCopyLibraryExamToBuilder.mock.calls[0][1]).toBe("شبكات VLAN");
    expect(calls.filter(c => c.url.startsWith("/api/exam-library/") && c.method === "GET")).toHaveLength(1);
    expect(posts()).toHaveLength(0);
  });
  it("a failed bank load shows an alert with retry and no table; retry issues one more load", async () => {
    let fail = true;
    bankResponder = () => (fail ? json({ ok: false, error: "تعذر تحميل بنك الأسئلة." }, 500) : json({ ok: true, questions: ROWS }));
    render(<ExamBankPage token="t" {...props} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("تعذر تحميل بنك الأسئلة.");
    expect(table()).toBeNull();
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));
    await screen.findByText("قابلة للتعديل");
    expect(gets("/api/bank-questions")).toBe(2);
  });
});
