// @vitest-environment happy-dom
//
// UX-5 — Assignments & Gradebook workspace. Drives the REAL AssignmentsPanel with a routed fetch mock and pins:
// the toolbar hierarchy (no duplicate hero), class filter / search / archive switch, the NON-MODAL composer (both
// sources, library search/categories/select/preview/copy, exact create body), list actions (explicit max-attempts
// save, confirm cancel → no request, exact bodies), the NON-MODAL detail (one results GET per open, focus in / focus
// return, four operational stats, no N+1), gradebook filters / sorts / grading labels / primary review action /
// lifecycle dialogs / snapshot merge / archived suppression, purge typed-title guard, lazy item analysis,
// loading / error / empty states and accessibility source guards.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";

const CLASSES = [
  { classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" },
  { classId: "c2", name: "العاشر", grade: "10", active: true, status: "active" },
  { classId: "c3", name: "دفعة 2025", grade: "12", active: false, status: "archived" }
];
const A1 = { assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "اختبار الكسور", instructions: "x", status: "published", openAt: "2026-02-01T08:00:00.000Z", dueAt: "2026-03-01T10:00:00.000Z", questionCount: 5, totalMarks: 100, maxAttempts: 3, durationMinutes: 90 };
const A2 = { ...A1, assignmentId: "a2", title: "واجب الجبر", status: "draft", durationMinutes: 0, maxAttempts: 1 };
const A3 = { ...A1, assignmentId: "a3", title: "واجب قديم", status: "archived", archivedAt: "2026-01-01T00:00:00.000Z", archivedFromStatus: "published" };
const A4 = { ...A1, assignmentId: "a4", classId: "c2", className: "العاشر", title: "اختبار الهندسة" };
const lr = (over: Record<string, unknown>) => ({ attemptNumber: 1, score: 62, totalMarks: 100, percentage: 62, submittedAt: "2026-03-01T10:00:00.000Z", finalized: false, manualReviewMarks: 18, gradingStatus: "pendingReview", teacherFeedback: "", ...over });
const finalLR = lr({ score: 90, percentage: 90, finalized: true, manualReviewMarks: 0, gradingStatus: "final" });
const PEND = { studentId: "s1", studentName: "زيد", studentCode: "P1", attemptsUsed: 1, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "submitted", gradingStatus: "pendingReview", activeAttempt: null, timed: true, attempts: [lr({})], latestResult: lr({}) };
const FIN = { studentId: "s2", studentName: "خالد", studentCode: "F1", attemptsUsed: 1, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "submitted", gradingStatus: "final", activeAttempt: null, timed: true, attempts: [finalLR], latestResult: finalLR };
const NOSUB = { studentId: "s3", studentName: "سعد", studentCode: "N1", attemptsUsed: 0, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "notStarted", gradingStatus: "notSubmitted", activeAttempt: null, timed: true, attempts: [], latestResult: null };
const ACT = { studentId: "s4", studentName: "عمر", studentCode: "A1", attemptsUsed: 1, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "started", gradingStatus: "final", timed: true, activeAttempt: { attemptNumber: 2, startedAt: "2026-03-01T10:00:00.000Z", endsAt: "2026-03-01T11:30:00.000Z", status: "started" }, effectiveAttemptEndsAt: "2026-03-01T11:30:00.000Z", attempts: [finalLR], latestResult: finalLR };
const STATS = { students: 4, submitted: 3, pendingReview: 1, finalized: 2, notSubmitted: 1, active: 1, average: 72, highest: 90, lowest: 62 };
const ANALYSIS = { assignmentId: "a1", title: "اختبار الكسور", studentsInClass: 4, studentsSubmitted: 3, attemptsAnalyzed: 3, questions: [
  { questionId: "q1", number: 1, text: "سؤال أول", type: "mcq", maxMarks: 10, studentsAnalyzed: 3, correctCount: 1, correctRate: 33, averageScore: 3, averagePercentage: 30, manualReviewCount: 0, difficulty: "hard" },
  { questionId: "q2", number: 2, text: "سؤال ثانٍ", type: "mcq", maxMarks: 10, studentsAnalyzed: 3, correctCount: 3, correctRate: 100, averageScore: 9, averagePercentage: 90, manualReviewCount: 0, difficulty: "easy" },
  { questionId: "q3", number: 3, text: "مقالي", type: "essay", maxMarks: 10, studentsAnalyzed: 0, correctCount: 0, correctRate: null, averageScore: null, averagePercentage: null, manualReviewCount: 2, difficulty: null }
] };
const SAVED = [{ blobName: "exams/e1.json", examId: "e1", title: "امتحان محفوظ", savedAt: "", questionCount: 4, totalMarks: 40 }];
const SAVED_EXAM = { examId: "e1", title: "امتحان محفوظ", totalMarks: 40, questions: [{}, {}, {}, {}] };
const CATALOG = [
  { libraryItemId: "L1", title: "شبكات VLAN", category: "infra", description: "", tags: ["vlan"], questionCount: 6, totalMarks: 60, conversionStatus: "ready", publishable: true },
  { libraryItemId: "L2", title: "DHCP متقدم", category: "infra", description: "", tags: ["dhcp"], questionCount: 3, totalMarks: 30, conversionStatus: "needs_review", publishable: false },
  { libraryItemId: "L3", title: "الجبر الخطي", category: "foundation", description: "", tags: [], questionCount: 2, totalMarks: 20, conversionStatus: "ready", publishable: true }
];
const LIB_EXAM = { title: "شبكات VLAN", totalMarks: 60, presentationTheme: "classic", questions: Array.from({ length: 6 }, (_, i) => ({ examQuestionId: "lq" + (i + 1), text: "سؤال مكتبة " + (i + 1), marks: 10, presentationType: "open" })) };

type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[] = [];
let impact: Record<string, unknown> = { assignmentId: "a3", status: "archived", submissionDocuments: 0, studentsWithCompletedAttempts: 0, completedAttempts: 0, activeAttempts: 0, draftDocuments: 0, canPurge: true };
let assignments = [A1, A2, A3, A4];
let students: unknown[] = [PEND, FIN, NOSUB, ACT];
let failAssignments = false;
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
function routed(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input); const method = (init?.method || "GET").toUpperCase();
  let body: Record<string, unknown> = {}; if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { /* ignore */ } }
  calls.push({ url, method, body });
  if (url.startsWith("/api/assignments") && method === "GET") return failAssignments ? json({ ok: false, error: "تعذر الاتصال" }, 500) : json({ ok: true, assignments });
  if (url.startsWith("/api/assignments")) {
    const a = String(body.action);
    if (a === "deleteImpact") return json({ ok: true, impact });
    if (a === "purge") return json({ ok: true, purged: true });
    const base = assignments.find(x => x.assignmentId === body.assignmentId) || A1;
    if (a === "archive") return json({ ok: true, assignment: { ...base, status: "archived", archivedFromStatus: base.status } });
    if (a === "restore") return json({ ok: true, assignment: { ...base, status: "published" } });
    if (a === "setStatus") return json({ ok: true, assignment: { ...base, status: body.status } });
    if (a === "setMaxAttempts") return json({ ok: true, assignment: { ...base, maxAttempts: body.maxAttempts } });
    if (a === "create") return json({ ok: true, assignment: { ...A1, assignmentId: "a9", title: String(body.title), classId: String(body.classId), className: "الحادي عشر", status: body.publish ? "published" : "draft" } });
    return json({ ok: true, assignment: base });
  }
  if (url.startsWith("/api/saved-exams") && method === "GET") return json({ ok: true, exams: SAVED });
  if (url.startsWith("/api/saved-exams")) return json({ ok: true, exam: SAVED_EXAM });
  if (url === "/api/exam-library") return json({ ok: true, catalog: CATALOG });
  if (url.startsWith("/api/exam-library/")) return json({ ok: true, item: { examSnapshot: LIB_EXAM } });
  if (url.startsWith("/api/assignment-results") && method === "GET") return json({ ok: true, stats: STATS, students });
  if (url.startsWith("/api/assignment-results")) {
    const a = String(body.action);
    if (a === "allowRetry") return json({ ok: true, allowedAttempts: 4, attemptsUsed: 1 });
    if (a === "setDueAtOverride") return json({ ok: true, dueAtOverride: body.dueAtOverride ?? null });
    if (a === "extendActiveAttempt") return json({ ok: true, activeAttempt: { ...ACT.activeAttempt, extendedEndsAt: body.newEndsAt }, effectiveAttemptEndsAt: body.newEndsAt });
    return json({ ok: true });
  }
  if (url.startsWith("/api/assignment-item-analysis")) return json({ ok: true, ...ANALYSIS });
  if (url.startsWith("/api/assignment-review")) return json({ ok: true, assignment: { assignmentId: "a1", title: "اختبار الكسور", totalMarks: 100 }, student: { studentId: "s1", studentName: "زيد", studentCode: "P1" }, attempt: { ...lr({}), teacherFeedback: "" }, attempts: [lr({})], questions: [] });
  return json({ ok: true });
}
beforeEach(() => { calls = []; assignments = [A1, A2, A3, A4]; students = [PEND, FIN, NOSUB, ACT]; failAssignments = false; impact = { ...impact, submissionDocuments: 0, activeAttempts: 0 }; (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; globalThis.fetch = vi.fn(routed) as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const gets = (prefix: string) => calls.filter(c => c.method === "GET" && c.url.startsWith(prefix));
const posts = (prefix: string) => calls.filter(c => c.method === "POST" && c.url.startsWith(prefix)).map(c => c.body);
async function mount(copy?: (exam: unknown, title: string) => void) {
  render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} onCopyLibraryExamToBuilder={copy} />);
  await screen.findByText("اختبار الكسور");
  return calls;
}
const list = () => document.querySelector(".eb-assign-rows") as HTMLElement;
const rowTitles = () => Array.from(list().querySelectorAll(".eb-assign-row-title strong")).map(x => x.textContent);
const rowOf = (title: string) => within(list()).getByText(title).closest(".assignment-row") as HTMLElement;
const openBtn = (title: string) => within(rowOf(title)).getByRole("button", { name: "فتح" });
async function assignmentMenu(title: string) { fireEvent.click(within(rowOf(title)).getByRole("button", { name: "إجراءات الواجب " + title })); return await screen.findByRole("group", { name: "إجراءات الواجب " + title }); }
async function assignmentAction(title: string, label: string) { fireEvent.click(within(await assignmentMenu(title)).getByRole("button", { name: label })); }
const confirmEl = () => waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm yet"); return el; });
async function confirmDialog(answer: "confirm" | "cancel" = "confirm") { const d = await confirmEl(); fireEvent.click(answer === "confirm" ? (d.querySelector(".eb-dialog-foot .is-primary, .eb-dialog-foot .is-danger") as HTMLElement) : within(d).getByRole("button", { name: "إلغاء" })); }
async function openDetail(title = "اختبار الكسور") { const trigger = openBtn(title); trigger.focus(); fireEvent.click(trigger); const detail = await screen.findByRole("region", { name: title }); await within(detail).findByText("زيد"); return { detail, trigger }; }
const gbRow = (detail: HTMLElement, name: string) => within(detail).getByText(name).closest("tr") as HTMLElement;
async function studentMenu(detail: HTMLElement, name: string) { fireEvent.click(within(gbRow(detail, name)).getByRole("button", { name: "إجراءات " + name })); return await screen.findByRole("group", { name: "إجراءات " + name }); }
const gbNames = (detail: HTMLElement) => Array.from(detail.querySelectorAll("tbody tr td:first-child strong")).map(x => x.textContent);
const dialog = (name: string) => screen.findByRole("dialog", { name });

describe("UX-5 workspace — toolbar, filter, search, archive switch, requests", () => {
  it("boots with exactly GET assignments + GET saved-exams (no results for any row), shows the toolbar and no duplicate hero", async () => {
    await mount();
    expect(calls.map(c => c.method + " " + c.url)).toEqual(["GET /api/assignments", "GET /api/saved-exams"]);
    expect(gets("/api/assignment-results")).toHaveLength(0);
    const toolbar = screen.getByRole("region", { name: "أدوات الواجبات" });
    expect((within(toolbar).getByLabelText("الصف") as HTMLSelectElement).value).toBe("c1");               // scope defaults to the first active class
    expect(within(toolbar).getByRole("button", { name: "الواجبات الحالية" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(toolbar).getByLabelText("بحث")).toBeTruthy();
    expect(within(toolbar).getByRole("button", { name: "إنشاء واجب" })).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(document.body.textContent).not.toMatch(/الواجبات، التصحيح وسجل العلامات|Phase 2\.0E|Assignments · /);
    expect(rowTitles()).toEqual(["اختبار الكسور", "واجب الجبر"]);
    expect(within(rowOf("اختبار الكسور")).getByText("منشور")).toBeTruthy(); expect(within(rowOf("واجب الجبر")).getByText("مسودة")).toBeTruthy();
    expect(rowOf("اختبار الكسور").textContent).toContain("5 سؤال · 100 علامة · 3 محاولة · 90 دقيقة");
    fireEvent.click(within(toolbar).getByRole("button", { name: "المزيد من إجراءات الواجبات" }));
    fireEvent.click(within(await screen.findByRole("group", { name: "المزيد من إجراءات الواجبات" })).getByRole("button", { name: "تحديث" }));
    await waitFor(() => expect(gets("/api/assignments")).toHaveLength(2));
    expect(gets("/api/saved-exams")).toHaveLength(2);
  });
  it("class filter (all / c2), title + class-name search and the archive switch are client-side (zero requests)", async () => {
    await mount(); calls = [];
    const toolbar = screen.getByRole("region", { name: "أدوات الواجبات" });
    fireEvent.change(within(toolbar).getByLabelText("الصف"), { target: { value: "" } });
    expect(rowTitles()).toEqual(["اختبار الكسور", "واجب الجبر", "اختبار الهندسة"]);
    fireEvent.change(within(toolbar).getByLabelText("الصف"), { target: { value: "c2" } });
    expect(rowTitles()).toEqual(["اختبار الهندسة"]);
    fireEvent.change(within(toolbar).getByLabelText("الصف"), { target: { value: "" } });
    fireEvent.change(within(toolbar).getByLabelText("بحث"), { target: { value: "جبر" } });
    expect(rowTitles()).toEqual(["واجب الجبر"]);
    fireEvent.change(within(toolbar).getByLabelText("بحث"), { target: { value: "العاشر" } });
    expect(rowTitles()).toEqual(["اختبار الهندسة"]);
    fireEvent.change(within(toolbar).getByLabelText("بحث"), { target: { value: "لا شيء" } });
    expect(screen.getByText("لا توجد واجبات مطابقة.")).toBeTruthy();
    fireEvent.change(within(toolbar).getByLabelText("بحث"), { target: { value: "" } });
    const archived = within(toolbar).getByRole("button", { name: /^المؤرشفة/ });
    expect(archived.textContent).toBe("المؤرشفة (1)");
    fireEvent.click(archived);
    expect(archived.getAttribute("aria-pressed")).toBe("true");
    expect(rowTitles()).toEqual(["واجب قديم"]);
    expect(rowOf("واجب قديم").textContent).toContain("أُرشف:");
    fireEvent.change(within(toolbar).getByLabelText("الصف"), { target: { value: "c2" } });
    expect(screen.getByText("لا توجد واجبات مؤرشفة.")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
  it("empty list state, load error as an alert", async () => {
    assignments = [];
    await (async () => { render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />); await screen.findByText("لا توجد واجبات بعد."); })();
    expect(screen.getAllByRole("button", { name: /إنشاء واجب/ }).length).toBeGreaterThanOrEqual(2);   // toolbar + empty-state action
    cleanup(); calls = []; failAssignments = true;
    render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
    expect((await screen.findByRole("alert")).textContent).toContain("تعذر الاتصال");
  });
});

describe("UX-5 composer — non-modal, both sources, exact create body", () => {
  it("opens in the detail area with the list still visible, focuses its heading, my-exams source loads a saved exam with the exact body, creates with exact body, closes and returns focus", async () => {
    await mount();
    const opener = screen.getByRole("button", { name: "إنشاء واجب" }); opener.focus();
    fireEvent.click(opener);
    const composer = await screen.findByRole("region", { name: "إنشاء واجب جديد" });
    expect(document.activeElement).toBe(within(composer).getByRole("heading", { level: 2, name: "إنشاء واجب جديد" }));
    expect(screen.queryByRole("dialog")).toBeNull();                                                  // NOT a dialog
    expect(rowTitles()).toEqual(["اختبار الكسور", "واجب الجبر"]);                                     // list still visible
    expect(within(composer).getByRole("button", { name: "امتحاناتي" }).getAttribute("aria-pressed")).toBe("true");
    expect(Array.from((within(composer).getByLabelText("الصف") as HTMLSelectElement).options).map(o => o.value)).toEqual(["", "c1", "c2"]); // active classes only
    const createBtn = within(composer).getByRole("button", { name: "إنشاء الواجب" }) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
    fireEvent.change(within(composer).getByLabelText("اختيار الامتحان"), { target: { value: "exams/e1.json" } });
    await within(composer).findByText("4 سؤال · 40 علامة");
    expect(posts("/api/saved-exams")).toEqual([{ action: "load", blobName: "exams/e1.json" }]);
    expect((within(composer).getByLabelText("عنوان الواجب") as HTMLInputElement).value).toBe("امتحان محفوظ");
    fireEvent.change(within(composer).getByLabelText("يفتح في"), { target: { value: "2026-04-01T08:00" } });
    fireEvent.change(within(composer).getByLabelText("آخر موعد"), { target: { value: "2026-04-05T10:00" } });
    fireEvent.change(within(composer).getByLabelText("عدد المحاولات"), { target: { value: "2" } });
    fireEvent.change(within(composer).getByLabelText("مدة المحاولة (بالدقائق)"), { target: { value: "45" } });
    fireEvent.click(within(composer).getByLabelText("نشر مباشرة"));
    expect(createBtn.disabled).toBe(false);
    fireEvent.click(createBtn);
    await screen.findByText("✓ تم إنشاء الواجب من الامتحان المختار.");
    expect(posts("/api/assignments")).toEqual([{ action: "create", classId: "c1", title: "امتحان محفوظ", instructions: "أجب عن جميع الأسئلة واقرأ التعليمات جيدًا قبل البدء.", openAt: new Date("2026-04-01T08:00").toISOString(), dueAt: new Date("2026-04-05T10:00").toISOString(), maxAttempts: 2, durationMinutes: 45, publish: false, examSnapshot: SAVED_EXAM }]);
    expect(screen.queryByRole("region", { name: "إنشاء واجب جديد" })).toBeNull();                   // closed after create
    expect(document.activeElement).toBe(opener);
    expect(rowTitles()[0]).toBe("امتحان محفوظ");
    fireEvent.click(opener);
    fireEvent.click(within(await screen.findByRole("region", { name: "إنشاء واجب جديد" })).getByRole("button", { name: "إلغاء" }));
    expect(screen.queryByRole("region", { name: "إنشاء واجب جديد" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
  it("library source: one lazy catalog GET, search + category chips (aria-pressed), publishable gating, select / preview / copy GETs, ExamPreview overlay unchanged", async () => {
    const copy = vi.fn();
    await mount(copy);
    fireEvent.click(screen.getByRole("button", { name: "إنشاء واجب" }));
    const composer = await screen.findByRole("region", { name: "إنشاء واجب جديد" });
    fireEvent.click(within(composer).getByRole("button", { name: "مكتبة 791381" }));
    await within(composer).findByRole("list", { name: "عناصر المكتبة" });
    expect(gets("/api/exam-library")).toHaveLength(1);
    fireEvent.click(within(composer).getByRole("button", { name: "امتحاناتي" })); fireEvent.click(within(composer).getByRole("button", { name: "مكتبة 791381" }));
    expect(gets("/api/exam-library")).toHaveLength(1);                                                // catalog cached
    const libList = within(composer).getByRole("list", { name: "عناصر المكتبة" });                     // picker remounts on source switch
    expect(within(libList).getAllByRole("listitem")).toHaveLength(3);
    const disabledSelect = within(libList).getByRole("button", { name: /^L2 DHCP متقدم/ }) as HTMLButtonElement;
    expect(disabledSelect.disabled).toBe(true); expect(within(libList).getByText("يحتاج مراجعة")).toBeTruthy();
    const chips = within(composer).getByRole("group", { name: "تصنيف المكتبة" });
    expect(within(chips).getAllByRole("button").map(b => b.textContent)).toEqual(["الكل", "الأساسيات", "البنى التحتية"]);
    fireEvent.click(within(chips).getByRole("button", { name: "الأساسيات" }));
    expect(within(chips).getByRole("button", { name: "الأساسيات" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(libList).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(within(composer).getByLabelText("بحث"), { target: { value: "vlan" } });
    expect(within(libList).queryAllByRole("listitem")).toHaveLength(0);
    expect(within(composer).getByText("لا توجد عناصر مطابقة.")).toBeTruthy();
    fireEvent.click(within(chips).getByRole("button", { name: "الكل" }));
    expect(within(libList).getAllByRole("listitem")).toHaveLength(1);
    expect(within(chips).getByRole("button", { name: "الكل" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(libList).getByRole("button", { name: /^L1 شبكات VLAN/ }));
    await within(composer).findByText("6 سؤال · 60 علامة");
    expect(gets("/api/exam-library/L1")).toHaveLength(1);
    expect((within(composer).getByLabelText("عنوان الواجب") as HTMLInputElement).value).toBe("شبكات VLAN");
    fireEvent.click(within(libList).getByRole("button", { name: "نسخ شبكات VLAN إلى الباني" }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(LIB_EXAM, "شبكات VLAN"));
    expect(gets("/api/exam-library/L1")).toHaveLength(2);
    fireEvent.click(within(libList).getByRole("button", { name: "معاينة شبكات VLAN" }));
    await waitFor(() => expect(gets("/api/exam-library/L1")).toHaveLength(3));
    const preview = await waitFor(() => { const el = document.querySelector(".sb-preview-overlay"); if (!el) throw new Error("no preview"); return el as HTMLElement; });
    expect(preview.getAttribute("role")).toBe("dialog");                                              // ExamPreview's own overlay, not the shared Dialog
    expect(document.querySelector(".eb-dialog-root")).toBeNull();
    fireEvent.click(within(preview).getByRole("button", { name: /إغلاق المعاينة/ }));
    await waitFor(() => expect(document.querySelector(".sb-preview-overlay")).toBeNull());
    fireEvent.change(within(composer).getByLabelText("بحث"), { target: { value: "" } });
    expect(within(libList).getAllByRole("listitem")).toHaveLength(3);
    expect(within(composer).getByRole("button", { name: "إنشاء الواجب" }).hasAttribute("disabled")).toBe(false);
  });
});

describe("UX-5 list actions — exact bodies, explicit attempts save, confirm gating, purge guard", () => {
  it("publish / unpublish / max attempts (cancel → nothing, save → one request)", async () => {
    await mount();
    await assignmentAction("واجب الجبر", "نشر");
    await waitFor(() => expect(posts("/api/assignments")).toEqual([{ assignmentId: "a2", action: "setStatus", status: "published" }]));
    await waitFor(() => expect(within(rowOf("واجب الجبر")).getByText("منشور")).toBeTruthy());
    await assignmentAction("اختبار الكسور", "إيقاف النشر");
    await waitFor(() => expect(posts("/api/assignments").at(-1)).toEqual({ assignmentId: "a1", action: "setStatus", status: "draft" }));
    await assignmentAction("اختبار الكسور", "تعديل عدد المحاولات");
    let d = await dialog("تعديل عدد المحاولات");
    fireEvent.click(within(d).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts("/api/assignments").filter(b => b.action === "setMaxAttempts")).toEqual([]);
    await assignmentAction("اختبار الكسور", "تعديل عدد المحاولات");
    d = await dialog("تعديل عدد المحاولات");
    expect((within(d).getByRole("button", { name: "حفظ" }) as HTMLButtonElement).disabled).toBe(true);   // unchanged value → nothing to save
    fireEvent.change(within(d).getByLabelText("عدد المحاولات المسموح بها"), { target: { value: "5" } });
    fireEvent.click(within(d).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(posts("/api/assignments").filter(b => b.action === "setMaxAttempts")).toEqual([{ assignmentId: "a1", action: "setMaxAttempts", maxAttempts: 5 }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rowOf("اختبار الكسور").textContent).toContain("5 محاولة");
  });
  it("archive: deleteImpact → confirm (exact text) → archive; cancel sends nothing; active attempts add confirmActiveAttempts:true", async () => {
    await mount();
    await assignmentAction("اختبار الكسور", "أرشفة");
    await waitFor(() => expect(posts("/api/assignments")).toEqual([{ action: "deleteImpact", assignmentId: "a1" }]));
    expect((await confirmEl()).textContent).toContain("سيتم إخفاء الواجب عن الطلاب مع الاحتفاظ بجميع التسليمات والنتائج. يمكنك استعادته لاحقًا.");
    await confirmDialog("cancel");
    expect(posts("/api/assignments").filter(b => b.action === "archive")).toEqual([]);
    impact = { ...impact, activeAttempts: 3 };
    await assignmentAction("اختبار الكسور", "أرشفة");
    expect((await confirmEl()).textContent).toContain("يوجد 3 طلاب في محاولات نشطة. أرشفة الواجب ستمنعهم من المتابعة حتى تتم استعادته. لن تُحذف إجاباتهم أو محاولاتهم.");
    await confirmDialog();
    await waitFor(() => expect(posts("/api/assignments").at(-1)).toEqual({ action: "archive", assignmentId: "a1", confirmActiveAttempts: true }));
    await waitFor(() => expect(rowTitles()).toEqual(["واجب الجبر"]));
    fireEvent.click(screen.getByRole("button", { name: /^المؤرشفة/ }));
    await assignmentAction("اختبار الكسور", "استعادة");
    await waitFor(() => expect(posts("/api/assignments").at(-1)).toEqual({ action: "restore", assignmentId: "a1" }));
  });
  it("purge: impact-gated, blocked with history, typed-title guard, exact body", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /^المؤرشفة/ }));
    impact = { ...impact, submissionDocuments: 2 };
    await assignmentAction("واجب قديم", "حذف نهائي");
    expect((await screen.findByRole("alert")).textContent).toContain("لا يمكن الحذف النهائي لأن للواجب بيانات طلاب محفوظة");
    expect(document.querySelector(".purge-modal")).toBeNull();
    impact = { ...impact, submissionDocuments: 0 };
    await assignmentAction("واجب قديم", "حذف نهائي");
    const d = await dialog("حذف نهائي");
    expect(d.className).toContain("tone-danger");
    const confirmBtn = within(d).getByRole("button", { name: "حذف نهائي" }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    fireEvent.change(within(d).getByLabelText("عنوان الواجب"), { target: { value: "واجب قديم " } });
    expect(confirmBtn.disabled).toBe(true);                                                          // exact title only
    fireEvent.change(within(d).getByLabelText("عنوان الواجب"), { target: { value: "واجب قديم" } });
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(posts("/api/assignments").filter(b => b.action === "purge")).toEqual([{ action: "purge", assignmentId: "a3", confirmAssignmentId: "a3", confirmTitle: "واجب قديم" }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("لا توجد واجبات مؤرشفة.")).toBeTruthy();
    expect(posts("/api/assignments").some(b => b.action === "delete")).toBe(false);
  });
});

describe("UX-5 detail — one results GET, focus, four operational stats, no N+1", () => {
  it("opening an assignment issues exactly one results GET, focuses the detail heading, renders header + stats; close returns focus; gradebook controls issue no requests", async () => {
    await mount();
    const { detail, trigger } = await openDetail();
    expect(gets("/api/assignment-results")).toHaveLength(1);
    expect(gets("/api/assignment-results")[0].url).toBe("/api/assignment-results?assignmentId=a1");
    expect(gets("/api/assignment-item-analysis")).toHaveLength(0);
    expect(document.activeElement).toBe(within(detail).getByRole("heading", { level: 2, name: "اختبار الكسور" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    const head = detail.querySelector(".eb-assign-detail-meta") as HTMLElement;
    expect(head.textContent).toContain("منشور"); expect(head.textContent).toContain("الحادي عشر"); expect(head.textContent).toContain("3 محاولة"); expect(head.textContent).toContain("مؤقّت · 90 دقيقة");
    const cards = Array.from(detail.querySelectorAll(".eb-stat-grid.is-primary .eb-stat-card")).map(c => (c.querySelector(".eb-stat-label")?.textContent || "") + "=" + (c.querySelector(".eb-stat-value")?.textContent || ""));
    expect(cards).toEqual(["تم التسليم=3/4", "بانتظار التصحيح=1", "نهائي=2", "لم يسلّم=1"]);
    expect((detail.querySelector(".eb-assign-stats-hints") as HTMLElement).textContent).toBe("المعدل 72%الأعلى 90%الأدنى 62%قيد المحاولة 1");
    const n = calls.length;
    fireEvent.click(within(detail).getByRole("button", { name: /^العلامة/ }));
    fireEvent.change(within(detail).getByLabelText("بحث بالاسم أو الكود"), { target: { value: "زيد" } });
    fireEvent.click(within(detail).getByRole("button", { name: "نهائي" }));
    expect(calls.length).toBe(n);                                                                   // zero requests for search/filter/sort
    fireEvent.click(within(detail).getByRole("button", { name: "إغلاق التفاصيل" }));
    expect(screen.queryByRole("region", { name: "اختبار الكسور" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await openDetail("واجب الجبر");
    expect(gets("/api/assignment-results").map(c => c.url)).toEqual(["/api/assignment-results?assignmentId=a1", "/api/assignment-results?assignmentId=a2"]);
    expect(gets("/api/assignment-results")).toHaveLength(2);                                        // never one per row
  });
  it("empty gradebook state and composer ↔ detail handover", async () => {
    students = [];
    await mount();
    const { detail } = await (async () => { const trigger = openBtn("اختبار الكسور"); fireEvent.click(trigger); const detail = await screen.findByRole("region", { name: "اختبار الكسور" }); await within(detail).findByText("لا يوجد طلاب في هذا الواجب بعد."); return { detail }; })();
    fireEvent.click(screen.getByRole("button", { name: "إنشاء واجب" }));
    await screen.findByRole("region", { name: "إنشاء واجب جديد" });
    expect(screen.queryByRole("region", { name: "اختبار الكسور" })).toBeNull();                      // composer takes the detail area
    fireEvent.click(within(screen.getByRole("region", { name: "إنشاء واجب جديد" })).getByRole("button", { name: "إلغاء" }));
    expect(await screen.findByRole("region", { name: "اختبار الكسور" })).toBeTruthy();               // back to the prior detail
    expect(detail).toBeTruthy();
    expect(gets("/api/assignment-results")).toHaveLength(1);                                        // no re-fetch on handover
  });
});

describe("UX-5 gradebook — filters, sorts, grading labels, review action, lifecycle menu, dialogs, snapshot merge", () => {
  it("grading labels come from the shared authority; primary action per row; filters (aria-pressed) and sorts keep the current results incl. null ordering", async () => {
    await mount();
    const { detail } = await openDetail();
    expect(gbNames(detail)).toEqual(["خالد", "زيد", "سعد", "عمر"]);                                   // name asc (ar)
    expect(within(detail).getByRole("columnheader", { name: /الطالب/ }).getAttribute("aria-sort")).toBe("ascending");
    expect(gbRow(detail, "زيد").querySelector(".review-state.pending")?.textContent).toBe("بانتظار التصحيح (18 ع.)");
    expect(gbRow(detail, "خالد").querySelector(".review-state.final")?.textContent).toBe("نهائي");
    expect(gbRow(detail, "سعد").querySelector(".review-state.none")?.textContent).toBe("لم يسلّم");
    expect(gbRow(detail, "زيد").querySelector(".lifecycle-badge")?.textContent).toBe("تم التسليم");
    expect(gbRow(detail, "عمر").textContent).toContain("ينتهي فعليًا:");
    expect(within(gbRow(detail, "زيد")).getByRole("button", { name: "تصحيح الآن" }).className).toContain("is-primary");
    expect(within(gbRow(detail, "خالد")).getByRole("button", { name: "عرض التصحيح" })).toBeTruthy();
    expect(within(gbRow(detail, "سعد")).queryByRole("button", { name: /تصحيح/ })).toBeNull();
    const filters = within(detail).getByRole("group", { name: "تصفية حسب حالة التصحيح" });
    fireEvent.click(within(filters).getByRole("button", { name: "بانتظار التصحيح" }));
    expect(within(filters).getByRole("button", { name: "بانتظار التصحيح" }).getAttribute("aria-pressed")).toBe("true");
    expect(gbNames(detail)).toEqual(["زيد"]);
    fireEvent.click(within(filters).getByRole("button", { name: "قيد المحاولة" })); expect(gbNames(detail)).toEqual(["عمر"]);
    fireEvent.click(within(filters).getByRole("button", { name: "لم يسلّم" })); expect(gbNames(detail)).toEqual(["سعد"]);
    fireEvent.click(within(filters).getByRole("button", { name: "الكل" }));
    fireEvent.click(within(detail).getByRole("button", { name: /^العلامة/ }));
    expect(within(detail).getByRole("columnheader", { name: /العلامة/ }).getAttribute("aria-sort")).toBe("descending");
    expect(gbNames(detail)).toEqual(["خالد", "عمر", "زيد", "سعد"]);                                    // highest; null last
    fireEvent.click(within(detail).getByRole("button", { name: /^العلامة/ }));
    expect(within(detail).getByRole("columnheader", { name: /العلامة/ }).getAttribute("aria-sort")).toBe("ascending");
    expect(gbNames(detail)).toEqual(["زيد", "خالد", "عمر", "سعد"]);                                    // lowest; null last
    fireEvent.click(within(detail).getByRole("button", { name: "بانتظار التصحيح أولًا" }));
    expect(within(detail).getByRole("button", { name: "بانتظار التصحيح أولًا" }).getAttribute("aria-pressed")).toBe("true");
    expect(gbNames(detail)).toEqual(["زيد", "خالد", "سعد", "عمر"]);
    fireEvent.click(within(detail).getByRole("button", { name: /الطالب/ }));
    expect(gbNames(detail)).toEqual(["خالد", "زيد", "سعد", "عمر"]);
  });
  it("lifecycle menu per row (extend only for an active timed attempt), each dialog posts the exact body, snapshots merge, cancel → no request, archived hides the menu", async () => {
    await mount();
    const { detail } = await openDetail();
    let menu = await studentMenu(detail, "عمر");
    expect(within(menu).getAllByRole("button").map(b => b.textContent)).toEqual(["منح محاولة إضافية", "إعادة فتح للطالب", "تمديد وقت المحاولة", "تمديد الموعد"]);
    expect((within(menu).getByRole("button", { name: "إعادة فتح للطالب" }) as HTMLButtonElement).disabled).toBe(true);   // active attempt → reopen disabled (as before)
    fireEvent.keyDown(document, { key: "Escape" });
    menu = await studentMenu(detail, "زيد");
    expect(within(menu).getAllByRole("button").map(b => b.textContent)).toEqual(["منح محاولة إضافية", "إعادة فتح للطالب", "تمديد الموعد"]);
    // grant: cancel → nothing; confirm → allowRetry + merged snapshot (allowedAttempts 3 → 4)
    fireEvent.click(within(menu).getByRole("button", { name: "منح محاولة إضافية" }));
    await confirmDialog("cancel");
    expect(posts("/api/assignment-results")).toEqual([]);
    menu = await studentMenu(detail, "زيد");
    fireEvent.click(within(menu).getByRole("button", { name: "منح محاولة إضافية" }));
    await confirmDialog();
    await waitFor(() => expect(posts("/api/assignment-results")).toEqual([{ action: "allowRetry", assignmentId: "a1", studentId: "s1" }]));
    await waitFor(() => expect(gbRow(detail, "زيد").textContent).toContain("1/4"));
    // reopen without and with reopenUntil
    menu = await studentMenu(detail, "زيد");
    fireEvent.click(within(menu).getByRole("button", { name: "إعادة فتح للطالب" }));
    let d = await dialog("إعادة فتح للطالب");
    expect((within(d).getByLabelText(/إعادة الفتح حتى/) as HTMLInputElement).value).toBe("");
    fireEvent.click(within(d).getByRole("button", { name: "حفظ إعادة الفتح" }));
    await confirmDialog();
    await waitFor(() => expect(posts("/api/assignment-results").at(-1)).toEqual({ action: "reopenStudent", assignmentId: "a1", studentId: "s1" }));
    menu = await studentMenu(detail, "زيد");
    fireEvent.click(within(menu).getByRole("button", { name: "إعادة فتح للطالب" }));
    d = await dialog("إعادة فتح للطالب");
    fireEvent.change(within(d).getByLabelText(/إعادة الفتح حتى/), { target: { value: "2026-03-10T09:00" } });
    fireEvent.click(within(d).getByRole("button", { name: "حفظ إعادة الفتح" }));
    await confirmDialog();
    await waitFor(() => expect(posts("/api/assignment-results").at(-1)).toEqual({ action: "reopenStudent", assignmentId: "a1", studentId: "s1", reopenUntil: new Date("2026-03-10T09:00").toISOString() }));
    // extend active attempt (timed, active) with the clip warning relative to the effective due date
    menu = await studentMenu(detail, "عمر");
    fireEvent.click(within(menu).getByRole("button", { name: "تمديد وقت المحاولة" }));
    d = await dialog("تمديد وقت المحاولة");
    expect(within(d).getByText(/النهاية الفعلية الحالية/)).toBeTruthy();
    fireEvent.change(within(d).getByLabelText("النهاية الجديدة"), { target: { value: "2026-03-02T05:00" } });
    expect(within(d).getByText(/موعد تسليم الطالب الحالي سيوقف المحاولة قبل هذا الوقت/)).toBeTruthy();
    fireEvent.click(within(d).getByRole("button", { name: "حفظ التمديد" }));
    await confirmDialog();
    await waitFor(() => expect(posts("/api/assignment-results").at(-1)).toEqual({ action: "extendActiveAttempt", assignmentId: "a1", studentId: "s4", newEndsAt: new Date("2026-03-02T05:00").toISOString() }));
    await waitFor(() => expect(gbRow(detail, "عمر").textContent).toContain("تم تمديد وقت المحاولة"));
    // deadline set + clear (no confirm, as before)
    menu = await studentMenu(detail, "خالد");
    fireEvent.click(within(menu).getByRole("button", { name: "تمديد الموعد" }));
    d = await dialog("تمديد الموعد");
    fireEvent.change(within(d).getByLabelText("الموعد الجديد"), { target: { value: "2026-03-08T10:00" } });
    fireEvent.click(within(d).getByRole("button", { name: "حفظ التمديد" }));
    await waitFor(() => expect(posts("/api/assignment-results").at(-1)).toEqual({ action: "setDueAtOverride", assignmentId: "a1", studentId: "s2", dueAtOverride: new Date("2026-03-08T10:00").toISOString() }));
    await waitFor(() => expect(gbRow(detail, "خالد").textContent).toContain("تمديد حتى:"));
    menu = await studentMenu(detail, "خالد");
    fireEvent.click(within(menu).getByRole("button", { name: "تمديد الموعد" }));
    d = await dialog("تمديد الموعد");
    fireEvent.click(within(d).getByRole("button", { name: "إلغاء التمديد" }));
    await waitFor(() => expect(posts("/api/assignment-results").at(-1)).toEqual({ action: "setDueAtOverride", assignmentId: "a1", studentId: "s2", dueAtOverride: null }));
    await waitFor(() => expect(gbRow(detail, "خالد").textContent).not.toContain("تمديد حتى:"));
    expect(gets("/api/assignment-results")).toHaveLength(1);                                          // snapshots merged, never re-fetched
    // archived → lifecycle menu gone, review kept
    await assignmentAction("اختبار الكسور", "أرشفة"); await confirmDialog();
    await waitFor(() => expect(screen.queryByRole("button", { name: "إجراءات زيد" })).toBeNull());
    expect(within(detail).getByRole("button", { name: "تصحيح الآن" })).toBeTruthy();
  });
  it("review opens AssignmentReview exactly as before and never leaves a row-editor dialog open beneath it", async () => {
    await mount();
    const { detail } = await openDetail();
    fireEvent.click(within(detail).getByRole("button", { name: "تصحيح الآن" }));
    await waitFor(() => expect(gets("/api/assignment-review")).toHaveLength(1));
    expect(gets("/api/assignment-review")[0].url).toBe("/api/assignment-review?assignmentId=a1&studentId=s1&attemptNumber=1");
    await waitFor(() => expect(document.querySelector(".review-overlay")).toBeTruthy());
    expect(document.querySelector(".eb-dialog-root")).toBeNull();
    fireEvent.click(within(document.querySelector(".review-overlay") as HTMLElement).getAllByRole("button", { name: /إغلاق|إلغاء/ })[0]);
    await waitFor(() => expect(document.querySelector(".review-overlay")).toBeNull());
  });
});

describe("UX-5 item analysis — lazy, sortable, empty", () => {
  it("is not loaded with the detail; one GET on request; sort chips with aria-pressed; hidden again without a request", async () => {
    await mount();
    const { detail } = await openDetail();
    expect(gets("/api/assignment-item-analysis")).toHaveLength(0);
    fireEvent.click(within(detail).getByRole("button", { name: "تحليل الأسئلة" }));
    const analysis = await within(detail).findByRole("region", { name: "تحليل الأسئلة" });
    expect(gets("/api/assignment-item-analysis")).toEqual([expect.objectContaining({ url: "/api/assignment-item-analysis?assignmentId=a1" })]);
    const cards = Array.from(analysis.querySelectorAll(".eb-stat-card")).map(c => (c.querySelector(".eb-stat-label")?.textContent || "") + "=" + (c.querySelector(".eb-stat-value")?.textContent || ""));
    expect(cards).toEqual(["طلاب في التحليل=3/4", "متوسط عام=60%", "أصعب سؤال=س1", "أسهل سؤال=س2"]);
    const order = () => Array.from(analysis.querySelectorAll("tbody tr td:first-child")).map(x => x.textContent);
    expect(order()).toEqual(["1", "2", "3"]);
    const sorts = within(analysis).getByRole("group", { name: "ترتيب الأسئلة" });
    fireEvent.click(within(sorts).getByRole("button", { name: "الأسهل أولًا" }));
    expect(within(sorts).getByRole("button", { name: "الأسهل أولًا" }).getAttribute("aria-pressed")).toBe("true");
    expect(order()).toEqual(["2", "1", "3"]);
    fireEvent.click(within(sorts).getByRole("button", { name: "الأصعب أولًا" }));
    expect(order()).toEqual(["1", "2", "3"]);
    fireEvent.click(within(detail).getByRole("button", { name: "تحليل الأسئلة" }));
    expect(within(detail).queryByRole("region", { name: "تحليل الأسئلة" })).toBeNull();
    expect(gets("/api/assignment-item-analysis")).toHaveLength(1);
  });
});

describe("UX-5 accessibility source guards", () => {
  const RAW = import.meta.glob("./{AssignmentsPanel,assignments/AssignmentList,assignments/AssignmentDetail,assignments/AssignmentComposer,assignments/Gradebook,assignments/GradebookRowEditors}.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  it("no window.confirm, no tablist/menu roles, no <details>, no action-control emoji; grading only through the shared authority", () => {
    expect(Object.keys(RAW)).toHaveLength(6);
    for (const [file, src] of Object.entries(RAW)) {
      expect(src, file).not.toMatch(/window\.confirm/);
      expect(src, file).not.toMatch(/role="(tablist|tab|menu|menuitem)"/);
      expect(src, file).not.toMatch(/<details|<summary/);
      // 🧠 📚 👁 📝 📤 📊 ✏ ⏱ ⏰ ⏳ ↻ as control glyphs
      expect(src, file).not.toMatch(/[\u{1F9E0}\u{1F4DA}\u{1F441}\u{1F4DD}\u{1F4E4}\u{1F4CA}\u{270F}\u{23F1}\u{23F0}\u{23F3}\u{21BB}]/u);
    }
    const panel = RAW["./AssignmentsPanel.tsx"];
    expect(panel).toMatch(/const rowGrading=\(s:StudentResult\):GradingStatus=>s\.gradingStatus\?s\.gradingStatus:resolveGradingStatus\(s\.latestResult\);/);
    expect(panel).toMatch(/useConfirm\(\)/);
    for (const child of ["./assignments/Gradebook.tsx", "./assignments/AssignmentDetail.tsx", "./assignments/GradebookRowEditors.tsx", "./assignments/AssignmentList.tsx"]) {
      expect(RAW[child], child).not.toMatch(/resolveGradingStatus|manualReviewMarks\s*>\s*0\s*\?\s*"(pending|final)|finalized\s*\?(?!\?)|percentage\s*[><]=?\s*\d|score\s*[><]=?\s*\d/);
    }
    expect(RAW["./assignments/Gradebook.tsx"]).toMatch(/gradingLabel\(gs\)/);
    expect(RAW["./assignments/Gradebook.tsx"]).toMatch(/gradingClass\(gs\)/);
    // purge keeps the typed-title guard and the exact body; archive keeps impact-first gating
    expect(panel).toMatch(/action:"purge",assignmentId:item\.assignmentId,confirmAssignmentId:item\.assignmentId,confirmTitle:purgeTitle/);
    expect(panel).toMatch(/const impact=await fetchImpact\(item\);if\(!impact\)return;\n   let confirmActive=false;/);
    expect(panel).toMatch(/if\(impact\.submissionDocuments>0\)\{setError\("لا يمكن الحذف النهائي/);
  });
});
