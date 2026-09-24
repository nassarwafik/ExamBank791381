// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, within, waitFor } from "@testing-library/react";
import TeacherMessagesPage from "./TeacherMessagesPage";
import type { TeacherMessagesClient, MessageView, ThreadState } from "./messagesClient";
import type { Classroom, Student } from "../students/types";

// Phase 5C — teacher «الرسائل» page. Deterministic deferred promises prove the stale-switch and send-vs-poll guards.

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
const cls = (classId: string, name: string, over: Partial<Classroom> = {}): Classroom => ({ classId, name, grade: "11", schoolYear: "2026", active: true, studentCount: 1, createdAt: "", ...over });
const stu = (userId: string, displayName: string, over: Partial<Student> = {}): Student => ({ userId, displayName, code: "", identityNumber: "", firstName: "", familyName: "", classId: "c1", active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0, ...over });
let seq = 0;
const msg = (body: string, senderRole: "teacher" | "student", senderDisplayName: string, kind: "direct" | "announcement" = "direct"): MessageView =>
  ({ messageId: String(1700000000000 + ++seq) + "-aaaaaaaaaaaaaaaa", kind, senderRole, senderDisplayName, body, createdAt: new Date(1700000000000 + seq * 1000).toISOString() });
const thread = (messages: MessageView[], canSend = true, readOnlyReason = ""): ThreadState => ({ messages, canSend, readOnlyReason });

function makeClient(over: Partial<TeacherMessagesClient> = {}): TeacherMessagesClient {
  return {
    listClasses: vi.fn(async () => [cls("c1", "الصف الأول"), cls("c2", "صف قديم", { status: "archived", active: false })]),
    listStudents: vi.fn(async (classId: string) => classId === "c1"
      ? [stu("s1", "سارة"), stu("s2", "خالد", { active: false }), stu("s3", "ليلى", { archived: true })]
      : [stu("s9", "طالب قديم", { classId: "c2" })]),
    getDirect: vi.fn(async () => thread([msg("مرحبا", "teacher", "أ. أحمد"), msg("أهلًا أستاذ", "student", "سارة")])),
    getAnnouncements: vi.fn(async (classId: string) => classId === "c1" ? thread([msg("اختبار الأحد", "teacher", "أ. أحمد", "announcement")]) : thread([msg("إعلان قديم", "teacher", "أ. أحمد", "announcement")], false, "هذا الصف مؤرشف. الرسائل السابقة متاحة للقراءة فقط.")),
    sendDirect: vi.fn(async (_s: string, body: string) => msg(body, "teacher", "أ. أحمد")),
    sendAnnouncement: vi.fn(async (_c: string, body: string) => msg(body, "teacher", "أ. أحمد", "announcement")),
    getClassUnread: vi.fn(async () => ({ totalUnread: 0, capped: false, byStudent: {} })),
    markDirectRead: vi.fn(async () => ({ unread: 0, capped: false })),
    ...over
  };
}
const pickClass = (value: string) => fireEvent.change(screen.getByRole("combobox", { name: "الصف" }), { target: { value } });
const threadList = (name = "المحادثة") => screen.getByRole("list", { name });

describe("classes & roster — existing APIs", () => {
  it("loads classes (archived marked), then the roster with active / disabled / archived status", async () => {
    const client = makeClient();
    render(<TeacherMessagesPage token="t" client={client} />);
    const select = await screen.findByRole("combobox", { name: "الصف" });
    expect(within(select).getByRole("option", { name: "صف قديم — مؤرشف" })).toBeTruthy();
    pickClass("c1");
    expect(client.listStudents).toHaveBeenCalledWith("c1");
    expect(await screen.findByText("الصف نشط")).toBeTruthy();
    const roster = await screen.findByRole("list", { name: "طلاب الصف" });
    expect(within(roster).getByRole("button", { name: /سارة\s*نشط/ })).toBeTruthy();
    expect(within(roster).getByRole("button", { name: /خالد\s*معطّل/ })).toBeTruthy();
    expect(within(roster).getByRole("button", { name: /ليلى\s*مؤرشف/ })).toBeTruthy();
  });

  it("a late roster response for class A never overwrites class B", async () => {
    const a = deferred<Student[]>(), b = deferred<Student[]>();
    const client = makeClient({ listStudents: vi.fn((classId: string) => (classId === "c1" ? a.promise : b.promise)) });
    render(<TeacherMessagesPage token="t" client={client} />);
    await screen.findByRole("combobox", { name: "الصف" });
    pickClass("c1");
    pickClass("c2");
    await act(async () => { b.resolve([stu("s9", "طالب الصف ب")]); });
    await act(async () => { a.resolve([stu("s1", "طالب الصف أ")]); });
    expect(screen.getByText("طالب الصف ب")).toBeTruthy();
    expect(screen.queryByText("طالب الصف أ")).toBeNull();
  });
});

describe("direct conversation", () => {
  it("renders teacher + student sender labels; a late response for student A never replaces student B", async () => {
    const a = deferred<ThreadState>(), b = deferred<ThreadState>();
    const client = makeClient({ getDirect: vi.fn((id: string) => (id === "s1" ? a.promise : b.promise)) });
    render(<TeacherMessagesPage token="t" client={client} />);
    await screen.findByRole("combobox", { name: "الصف" });
    pickClass("c1");
    const roster = await screen.findByRole("list", { name: "طلاب الصف" });
    fireEvent.click(within(roster).getByRole("button", { name: /سارة/ }));
    fireEvent.click(within(roster).getByRole("button", { name: /خالد/ }));
    await act(async () => { b.resolve(thread([msg("رسالة خالد", "student", "خالد")])); });
    await act(async () => { a.resolve(thread([msg("رسالة سارة", "student", "سارة")])); });
    expect(within(threadList()).getByText("رسالة خالد")).toBeTruthy();
    expect(screen.queryByText("رسالة سارة")).toBeNull();
    expect(within(threadList()).getByText("خالد")).toBeTruthy();                 // sender label (student name)
  });

  it("send: disabled while busy; failure keeps the draft + shows an error; success clears it and shows the server-confirmed message", async () => {
    const pending = deferred<MessageView>();
    const client = makeClient({ sendDirect: vi.fn().mockImplementationOnce(() => pending.promise).mockImplementationOnce(async (_s: string, body: string) => msg(body, "teacher", "أ. أحمد")) });
    render(<TeacherMessagesPage token="t" client={client} />);
    await screen.findByRole("combobox", { name: "الصف" });
    pickClass("c1");
    fireEvent.click(within(await screen.findByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /سارة/ }));
    await screen.findByText("أهلًا أستاذ");
    expect(within(threadList()).getAllByText("أنت").length).toBeGreaterThan(0);
    expect(within(threadList()).getByText("سارة")).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "رسالة إلى الطالب" }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "واجب الغد" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));
    expect((screen.getByRole("button", { name: "جارٍ الإرسال..." }) as HTMLButtonElement).disabled).toBe(true);
    expect(box.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "جارٍ الإرسال..." }));
    expect(client.sendDirect).toHaveBeenCalledTimes(1);                          // no duplicate send
    await act(async () => { pending.reject(new Error("تعذر إرسال الرسالة.")); });
    expect(screen.getByRole("alert").textContent).toContain("تعذر إرسال الرسالة.");
    expect(box.value).toBe("واجب الغد");                                        // draft kept
    expect(screen.queryByText("واجب الغد", { selector: ".eb-msg-body" })).toBeNull();   // no fake sent message
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));
    await waitFor(() => expect(within(threadList()).getByText("واجب الغد")).toBeTruthy());
    expect((screen.getByRole("textbox", { name: "رسالة إلى الطالب" }) as HTMLTextAreaElement).value).toBe("");
    expect(client.sendDirect).toHaveBeenLastCalledWith("s1", "واجب الغد");
  });

  it("a read-only thread (archived/disabled student or archived class) shows history and no composer", async () => {
    const client = makeClient({ getDirect: vi.fn(async () => thread([msg("قديمة", "teacher", "أ. أحمد")], false, "هذا الطالب مؤرشف. المحادثة السابقة متاحة للقراءة فقط.")) });
    render(<TeacherMessagesPage token="t" client={client} />);
    await screen.findByRole("combobox", { name: "الصف" });
    pickClass("c1");
    fireEvent.click(within(await screen.findByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /ليلى/ }));
    expect(await screen.findByText("قديمة")).toBeTruthy();
    expect(screen.getByText("هذا الطالب مؤرشف. المحادثة السابقة متاحة للقراءة فقط.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("class announcements", () => {
  it("active class: history + composer; archived class: history stays visible, composer hidden with the read-only text", async () => {
    const client = makeClient();
    render(<TeacherMessagesPage token="t" client={client} />);
    await screen.findByRole("combobox", { name: "الصف" });
    pickClass("c1");
    fireEvent.click(screen.getByRole("tab", { name: "إعلانات الصف" }));
    expect(await screen.findByText("اختبار الأحد")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "إعلان جديد للصف" }), { target: { value: "لا دوام غدًا" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال إعلان للصف" }));
    await waitFor(() => expect(within(threadList("إعلانات الصف")).getByText("لا دوام غدًا")).toBeTruthy());
    expect(client.sendAnnouncement).toHaveBeenCalledWith("c1", "لا دوام غدًا");

    pickClass("c2");
    expect(await screen.findByText("إعلان قديم")).toBeTruthy();
    expect(screen.getByText("الصف مؤرشف (للقراءة فقط)")).toBeTruthy();
    expect(screen.getByText("هذا الصف مؤرشف. الرسائل السابقة متاحة للقراءة فقط.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "إرسال إعلان للصف" })).toBeNull();
  });
});

describe("polling", () => {
  it("polls ONLY the visible thread every 5s, single-flight, and stops on unmount; classes/roster are not re-polled", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = makeClient();
    const view = render(<TeacherMessagesPage token="t" client={client} />);
    await screen.findByRole("combobox", { name: "الصف" });
    pickClass("c1");
    fireEvent.click(within(await screen.findByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /سارة/ }));
    await screen.findByText("أهلًا أستاذ");
    const direct = client.getDirect as ReturnType<typeof vi.fn>;
    const base = direct.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(direct.mock.calls.length).toBe(base + 1);
    // single-flight: a hanging poll blocks further polls
    const hang = deferred<ThreadState>();
    direct.mockImplementation(() => hang.promise);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    const during = direct.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(direct.mock.calls.length).toBe(during);
    await act(async () => { hang.resolve(thread([])); });
    expect((client.listClasses as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect((client.listStudents as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    view.unmount();
    direct.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(direct).not.toHaveBeenCalled();
  });

  it("a poll that started BEFORE a send cannot erase the just-sent message when it resolves late", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = thread([msg("قديمة", "teacher", "أ. أحمد")]);
    const oldPoll = deferred<ThreadState>();
    let calls = 0;
    const client = makeClient({ getDirect: vi.fn(() => (++calls === 2 ? oldPoll.promise : Promise.resolve(first))) });
    render(<TeacherMessagesPage token="t" client={client} />);
    await screen.findByRole("combobox", { name: "الصف" });
    pickClass("c1");
    fireEvent.click(within(await screen.findByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /سارة/ }));
    await screen.findByText("قديمة");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });          // poll #2 starts and hangs
    expect(calls).toBe(2);
    fireEvent.change(screen.getByRole("textbox", { name: "رسالة إلى الطالب" }), { target: { value: "رسالة جديدة" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "إرسال" })); });
    await waitFor(() => expect(within(threadList()).getByText("رسالة جديدة")).toBeTruthy());
    await act(async () => { oldPoll.resolve(first); });                           // old snapshot WITHOUT the new message
    expect(within(threadList()).getByText("رسالة جديدة")).toBeTruthy();
  });
});
