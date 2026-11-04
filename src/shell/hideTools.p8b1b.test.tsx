// @vitest-environment happy-dom
// Tadris+ P8-B1b — the second half of hiding the tools the teacher's access refuses INSIDE a page they can open (blueprint §9.1):
// the question bank, messages, games and the class reading panel (the project tracker: src/projects/ProjectAccess.p8b1b.test.tsx;
// the dashboard's AI section: src/TeacherDashboard.scope8a.test.tsx). PRESENTATION ONLY: the server still refuses every one of
// these actions (route-capabilities.js names each capability). No access information / not enforced → every tool, as before.
// The first block is a FAIL-FIRST proof (run against the baseline 5090bbae with only this file added): a teacher who may view the
// bank but has no builder (the «learning + ready assignments» preset) was shown «تعذر تحميل الامتحانات المحفوظة» on arrival — the
// page always read /api/saved-exams — and was offered «إضافة سؤال», «استيراد» and «إنشاء امتحان جديد». TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { TeacherAccessContext } from "./teacherAccessContext";
import ExamBankPage from "../bank/ExamBankPage";
import TeacherMessagesPage from "../messages/TeacherMessagesPage";
import TeacherGamesPage from "../games/TeacherGamesPage";
import ClassReadingPanel from "../learning/classReading/ClassReadingPanel";
import type { MessageView, TeacherMessagesClient, ThreadState } from "../messages/messagesClient";
import type { ClassReadingClient } from "../learning/classReading/classReadingClient";
import type { Classroom, LearningCatalogCourse, Student } from "../students/types";

const withAccess = (capabilities: string[] | null, ui: ReactNode) => <TeacherAccessContext.Provider value={capabilities ? { status: "ok", enforced: true, capabilities } : null}>{ui}</TeacherAccessContext.Provider>;
const BASE = ["classes.class.view", "students.student.view", "learning.course.view", "reports.widget.view"];
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ── The question bank ──────────────────────────────────────────────────────────────────────────────────────────────
const json = (data: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => data } as Response);
const QUESTION = { id: "manual-x1", sourceId: "manual", sourceKind: "manual", official: false, questionNumber: "1", section: "BASIC", topic: "NETWORK_BASICS", difficulty: 2, difficultyLabel: "", type: "multipleChoice", presentationType: "multipleChoice", text: "ما هو الراوتر؟", options: [{ value: "a", text: "جهاز توجيه" }, { value: "b", text: "كابل" }], fields: [], wordBank: [], answer: { mode: "singleChoice", correctOptionValue: "a", values: ["a"] }, hasImage: false, reviewStatus: "classified", createdAt: "2026-03-01T10:00:00.000Z", updatedAt: "2026-03-01T10:00:00.000Z" };
let calls: string[] = [];
beforeEach(() => {
  calls = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    calls.push(method + " " + url);
    if (url === "/api/bank-questions") return json({ ok: true, questions: [QUESTION] });
    if (url === "/api/saved-exams") return json({ ok: false, code: "CAPABILITY_DENIED", error: "لا تملك صلاحية تنفيذ هذا الإجراء." }, 403);
    if (url === "/api/exam-library") return json({ ok: true, catalog: [{ libraryItemId: "L1", title: "شبكات VLAN", questionCount: 6, totalMarks: 60, publishable: true }] });
    return json({ ok: true });
  }) as unknown as typeof fetch;
});
const noop = () => {};
const mountBank = async (capabilities: string[] | null) => {
  render(withAccess(capabilities, <ExamBankPage token="t" onOpenBuilder={noop} onOpenImport={noop} onOpenSavedExam={noop} onCopyLibraryExamToBuilder={noop} />));
  await screen.findByText("عدد الأسئلة");
  await new Promise(r => setTimeout(r, 20));
};
const bankTabs = () => within(screen.getByRole("group", { name: "أقسام بنك الامتحانات" })).getAllByRole("button").map(b => b.textContent);
const VIEW_BANK = [...BASE, "examBank.collection.view", "examLibrary.item.view"];
const FULL_BANK = [...VIEW_BANK, "examBank.question.create", "examBank.question.edit", "examBank.import.use", "examBuilder.exam.edit", "examBuilder.exam.create", "examBuilder.exam.save"];

describe("P8-B1b fail-first — a teacher who may only view the bank", () => {
  it("the saved exams (the builder's) are not read, so no refusal is shown on arrival; their section is not offered", async () => {
    await mountBank(VIEW_BANK);
    expect(calls.filter(c => c.includes("/api/saved-exams"))).toEqual([]);
    expect(screen.queryByText(/لا تملك صلاحية|تعذر تحميل الامتحانات المحفوظة/)).toBeNull();
    expect(bankTabs()).toEqual(["نظرة عامة", "بنك الأسئلة", "المكتبة الرسمية"]);
    expect(screen.queryByText("الامتحانات المحفوظة", { selector: ".eb-stat-label" })).toBeNull();
  });
  it("no «إنشاء امتحان جديد», «إضافة سؤال» or «استيراد»; a question offers «معاينة» only; the library copy needs the builder", async () => {
    await mountBank(VIEW_BANK);
    for (const name of [/إنشاء امتحان جديد/, /إضافة سؤال/, /استيراد/]) expect(screen.queryByRole("button", { name })).toBeNull();
    fireEvent.click(within(screen.getByRole("group", { name: "أقسام بنك الامتحانات" })).getByRole("button", { name: "بنك الأسئلة" }));
    const row = (await screen.findByText("ما هو الراوتر؟")).closest("tr") as HTMLElement;
    expect(within(row).getAllByRole("button").map(b => b.textContent)).toEqual(["معاينة"]);
    fireEvent.click(within(screen.getByRole("group", { name: "أقسام بنك الامتحانات" })).getByRole("button", { name: "المكتبة الرسمية" }));
    await screen.findByText("شبكات VLAN");
    expect(screen.queryByRole("button", { name: /فتح نسخة في الباني/ })).toBeNull();
  });
});

describe("P8-B1b — the bank with every tool, and each tool on its own", () => {
  it("full access: every section and every tool (the saved exams are read)", async () => {
    await mountBank(FULL_BANK);
    expect(calls.some(c => c === "GET /api/saved-exams")).toBe(true);
    expect(bankTabs()).toEqual(["نظرة عامة", "بنك الأسئلة", "الامتحانات المحفوظة", "المكتبة الرسمية"]);
    for (const name of [/إنشاء امتحان جديد/, /إضافة سؤال/, /استيراد أسئلة/]) expect(screen.getByRole("button", { name })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "أقسام بنك الامتحانات" })).getByRole("button", { name: "بنك الأسئلة" }));
    const row = (await screen.findByText("ما هو الراوتر؟")).closest("tr") as HTMLElement;
    expect(within(row).getAllByRole("button").map(b => b.textContent)).toEqual(["معاينة", "تعديل", "حذف"]);
  });
  it("create without edit: «إضافة سؤال» yes, «تعديل» / «حذف» no; import alone: «استيراد أسئلة» only", async () => {
    await mountBank([...VIEW_BANK, "examBank.question.create"]);
    expect(screen.getByRole("button", { name: /إضافة سؤال/ })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "أقسام بنك الامتحانات" })).getByRole("button", { name: "بنك الأسئلة" }));
    const row = (await screen.findByText("ما هو الراوتر؟")).closest("tr") as HTMLElement;
    expect(within(row).getAllByRole("button").map(b => b.textContent)).toEqual(["معاينة"]);
    cleanup();
    await mountBank([...VIEW_BANK, "examBank.import.use"]);
    expect(screen.getByRole("button", { name: /استيراد أسئلة/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /إضافة سؤال/ })).toBeNull();
  });
  it("no library access: no «المكتبة الرسمية» section", async () => {
    await mountBank(VIEW_BANK.filter(c => c !== "examLibrary.item.view"));
    expect(bankTabs()).toEqual(["نظرة عامة", "بنك الأسئلة"]);
  });
  it("no access information: every section and tool, as before", async () => {
    await mountBank(null);
    expect(bankTabs().length).toBe(4);
    expect(screen.getByRole("button", { name: /إضافة سؤال/ })).toBeTruthy();
  });
});

// ── Messages ───────────────────────────────────────────────────────────────────────────────────────────────────────
const FUTURE = new Date(Date.now() + 10 * 60_000).toISOString();
const msg = (p: number, kind: "direct" | "announcement" = "direct"): MessageView => ({ messageId: String(9000000000000 + p) + "-aaaaaaaaaaaaaaaa", kind, senderRole: "teacher", senderDisplayName: "أ. أحمد", body: "رسالة " + p, createdAt: new Date(1800000000000 + p * 1000).toISOString(), canDelete: true, editableUntil: FUTURE });
const cls = (classId: string, name: string): Classroom => ({ classId, name, grade: "11", schoolYear: "2026", active: true, studentCount: 2, createdAt: "" });
const stu = (userId: string, displayName: string): Student => ({ userId, displayName, code: "", identityNumber: "", firstName: "", familyName: "", classId: "c1", active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0 });
const thread = (messages: MessageView[]): ThreadState => ({ messages, canSend: true, readOnlyReason: "" });
const client = (): TeacherMessagesClient => ({
  listClasses: vi.fn(async () => [cls("c1", "الحادي عشر")]), listStudents: vi.fn(async () => [stu("s1", "سارة")]),
  getDirect: vi.fn(async () => thread([msg(1)])), getAnnouncements: vi.fn(async () => thread([msg(9, "announcement")])),
  sendDirect: vi.fn(async () => msg(99)), sendAnnouncement: vi.fn(async () => msg(98, "announcement")),
  getClassUnread: vi.fn(async () => ({ totalUnread: 0, capped: false, byStudent: {} })), markDirectRead: vi.fn(async () => ({ unread: 0, capped: false })),
  editMessage: vi.fn(async () => msg(1)), deleteMessage: vi.fn(async () => msg(1))
});
const READ = [...BASE, "messages.inbox.read"];
async function openDirect(capabilities: string[] | null) {
  render(withAccess(capabilities, <TeacherMessagesPage token="t" client={client()} />));
  fireEvent.change(await screen.findByRole("combobox", { name: "الصف" }), { target: { value: "c1" } });
  fireEvent.click(within(await screen.findByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /سارة/ }));
  await screen.findByText("رسالة 1");
}
async function openAnnouncements() {
  fireEvent.click(screen.getByRole("tab", { name: "إعلانات الصف" }));
  await screen.findByText("رسالة 9");
}
const composer = (label: string) => screen.queryByRole("textbox", { name: label });
const editOf = (text: string) => within(screen.getByText(text).closest("li") as HTMLElement).queryByRole("button", { name: /تعديل/ });

describe("P8-B1b — messages: each composer needs its own capability", () => {
  it("read only: no composer in either thread (a note says so), no edit / delete; the messages are read", async () => {
    await openDirect(READ);
    expect(composer("رسالة إلى الطالب")).toBeNull();
    expect(screen.getByText("الإرسال غير مفعّل لحسابك. الرسائل متاحة للقراءة فقط.")).toBeTruthy();
    expect(editOf("رسالة 1")).toBeNull();
    await openAnnouncements();
    expect(composer("إعلان جديد للصف")).toBeNull();
    expect(editOf("رسالة 9")).toBeNull();
  });
  it("direct send without announcements: the direct composer only; editing is offered (the route allows either)", async () => {
    await openDirect([...READ, "messages.direct.send"]);
    expect(composer("رسالة إلى الطالب")).toBeTruthy();
    expect(editOf("رسالة 1")).toBeTruthy();
    await openAnnouncements();
    expect(composer("إعلان جديد للصف")).toBeNull();
    expect(screen.getByText("الإرسال غير مفعّل لحسابك. الرسائل متاحة للقراءة فقط.")).toBeTruthy();
  });
  it("announcements without direct send: the announcement composer only", async () => {
    await openDirect([...READ, "messages.announcement.send"]);
    expect(composer("رسالة إلى الطالب")).toBeNull();
    await openAnnouncements();
    expect(composer("إعلان جديد للصف")).toBeTruthy();
  });
  it("no access information: both composers, as before", async () => {
    await openDirect(null);
    expect(composer("رسالة إلى الطالب")).toBeTruthy();
    await openAnnouncements();
    expect(composer("إعلان جديد للصف")).toBeTruthy();
  });
});

// ── Games (owner decision §19.30: the button is hidden; the preset is unchanged) ─────────────────────────────────────
describe("P8-B1b — «إنشاء تحدٍّ» needs games.challenge.create", () => {
  const RUN = [...BASE, "games.catalog.view", "games.session.run"];
  it("a teacher who may run games but not author a challenge: the card is shown, «إنشاء تحدٍّ» is not", () => {
    render(withAccess(RUN, <TeacherGamesPage token="t" openGames={["number-conversion", "live-challenge"]} />));
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(2);
    expect(screen.queryByRole("button", { name: "إنشاء تحدٍّ" })).toBeNull();
    expect(screen.getByRole("button", { name: "معاينة اللعبة" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/يمكنك الآن إنشاء تحدٍّ/);
  });
  it("with games.challenge.create (or without access information): offered", () => {
    render(withAccess([...RUN, "games.challenge.create"], <TeacherGamesPage token="t" />));
    expect(screen.getByRole("button", { name: "إنشاء تحدٍّ" })).toBeTruthy();
    cleanup();
    render(withAccess(null, <TeacherGamesPage token="t" />));
    expect(screen.getByRole("button", { name: "إنشاء تحدٍّ" })).toBeTruthy();
  });
});

// ── The class reading panel ────────────────────────────────────────────────────────────────────────────────────────
describe("P8-B1b — the reading panel: publishing needs learning.module.release", () => {
  const C = "791381";
  const room = (classId: string, name: string, withBook: boolean): Classroom => ({ classId, name, grade: "10", schoolYear: "2026", active: true, status: "active", studentCount: 1, createdAt: "", learningMaterials: withBook ? [{ courseId: C, visibleModuleIds: [C + "-m01"] }] : [] });
  const CATALOG: LearningCatalogCourse[] = [{ courseId: C, title: "شبكات", subject: "حاسوب", modules: [{ moduleId: C + "-m01", title: "الوحدة الأولى", order: 1 }] }];
  const reading: ClassReadingClient = {
    classes: vi.fn(async () => [room("c1", "العاشر", true), room("c2", "الحادي عشر", false)]), catalog: vi.fn(async () => CATALOG),
    reading: vi.fn(async (classId: string) => ({ classId, courseId: C, generatedAt: "2026-10-17T12:00:00.000Z", totalPages: 10, modules: [], students: [] })),
    publish: vi.fn(async () => [])
  };
  const open = async (capabilities: string[] | null) => {
    render(withAccess(capabilities, <ClassReadingPanel courseId={C} client={reading} />));
    fireEvent.click(screen.getByRole("button", { name: "عرض قراءة الصفوف" }));
    await screen.findByRole("combobox", { name: "الصف" });
  };
  it("without it: the report stays; «إدارة النشر» and «إضافة إلى الصف» are not offered", async () => {
    await open([...BASE, "learning.progress.view"]);
    await waitFor(() => expect(reading.reading).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "إدارة النشر" })).toBeNull();
    expect(screen.queryByRole("button", { name: "إضافة إلى الصف" })).toBeNull();
  });
  it("with it: both are offered", async () => {
    await open([...BASE, "learning.module.release"]);
    expect(screen.getByRole("button", { name: "إدارة النشر" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "إضافة إلى الصف" })).toBeTruthy();
  });
});
