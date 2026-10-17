// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, within, waitFor } from "@testing-library/react";
import TeacherMessagesPage from "./TeacherMessagesPage";
import StudentMessagesPage from "./StudentMessagesPage";
import type { MessageView, StudentMessagesClient, TeacherMessagesClient, ThreadState } from "./messagesClient";
import type { Classroom, Student } from "../students/types";

// Messages M.3 — older history («عرض الرسائل الأقدم») and messages held back by the unread frontier. Older pages are
// display-only: acknowledgements keep coming from the GET snapshot alone (pinned below).

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const id = (p: number) => String(9000000000000 + p) + "-aaaaaaaaaaaaaaaa";
const msg = (p: number, senderRole: "teacher" | "student", kind: "direct" | "announcement" = "direct"): MessageView =>
  ({ messageId: id(p), kind, senderRole, senderDisplayName: senderRole === "teacher" ? "أ. أحمد" : "سارة", body: "رسالة " + p, createdAt: new Date(1800000000000 + p * 1000).toISOString() });
const range = (a: number, b: number, role: (p: number) => "teacher" | "student") => Array.from({ length: b - a + 1 }, (_, i) => msg(a + i, role(a + i)));
const cls = (classId: string, name: string): Classroom => ({ classId, name, grade: "11", schoolYear: "2026", active: true, studentCount: 2, createdAt: "" });
const stu = (userId: string, displayName: string): Student => ({ userId, displayName, code: "", identityNumber: "", firstName: "", familyName: "", classId: "c1", active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0 });
const thread = (messages: MessageView[], extra: Partial<ThreadState> = {}): ThreadState => ({ messages, canSend: true, readOnlyReason: "", ...extra });

function teacherClient(over: Partial<TeacherMessagesClient> = {}): TeacherMessagesClient {
  return {
    listClasses: vi.fn(async () => [cls("c1", "الحادي عشر")]),
    listStudents: vi.fn(async () => [stu("s1", "سارة"), stu("s2", "خالد")]),
    getDirect: vi.fn(async (_s: string, before?: string) => (before ? thread(range(1, 3, () => "student"), { hasMore: false }) : thread(range(4, 6, p => (p % 2 ? "student" : "teacher")), { hasMore: true }))),
    getAnnouncements: vi.fn(async () => thread([msg(9, "teacher", "announcement")])),
    sendDirect: vi.fn(async (_s: string, body: string) => ({ ...msg(99, "teacher"), body })),
    sendAnnouncement: vi.fn(async (_c: string, body: string) => ({ ...msg(99, "teacher", "announcement"), body })),
    getClassUnread: vi.fn(async () => ({ totalUnread: 0, capped: false, byStudent: {} })),
    markDirectRead: vi.fn(async () => ({ unread: 0, capped: false })),
    ...over
  };
}
async function openSara() {
  fireEvent.change(await screen.findByRole("combobox", { name: "الصف" }), { target: { value: "c1" } });
  fireEvent.click(within(await screen.findByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /سارة/ }));
}
const bodies = () => within(screen.getByRole("list", { name: "المحادثة" })).getAllByRole("listitem").map(li => li.querySelector(".eb-msg-body")?.textContent);

describe("teacher — older history", () => {
  it("«عرض الرسائل الأقدم» loads the page before the oldest shown message and prepends it; the button goes when nothing older is left", async () => {
    const client = teacherClient();
    render(<TeacherMessagesPage token="t" client={client} />);
    await openSara();
    await screen.findByText("رسالة 6");
    fireEvent.click(screen.getByRole("button", { name: "عرض الرسائل الأقدم" }));
    await waitFor(() => expect(bodies()).toEqual(["رسالة 1", "رسالة 2", "رسالة 3", "رسالة 4", "رسالة 5", "رسالة 6"]));
    expect(client.getDirect).toHaveBeenLastCalledWith("s1", id(4));
    expect(screen.queryByRole("button", { name: "عرض الرسائل الأقدم" })).toBeNull();
  });

  it("older pages never feed an acknowledgement: every mark is built from the latest snapshot", async () => {
    const client = teacherClient();
    render(<TeacherMessagesPage token="t" client={client} />);
    await openSara();
    await screen.findByText("رسالة 6");
    fireEvent.click(screen.getByRole("button", { name: "عرض الرسائل الأقدم" }));
    await screen.findByText("رسالة 1");
    const marks = (client.markDirectRead as ReturnType<typeof vi.fn>).mock.calls.map(c => c[1].throughMessageId);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every(m => m === id(5))).toBe(true);                 // the latest STUDENT message of the snapshot
  });

  it("switching to another student drops the loaded older pages", async () => {
    const client = teacherClient();
    render(<TeacherMessagesPage token="t" client={client} />);
    await openSara();
    await screen.findByText("رسالة 6");
    fireEvent.click(screen.getByRole("button", { name: "عرض الرسائل الأقدم" }));
    await screen.findByText("رسالة 1");
    fireEvent.click(within(screen.getByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /خالد/ }));
    await waitFor(() => expect(screen.queryByText("رسالة 1")).toBeNull());
    expect(screen.getByRole("button", { name: "عرض الرسائل الأقدم" })).toBeTruthy();
  });

  it("a failed older load shows its own error and keeps the button for a retry", async () => {
    let fail = true;
    const client = teacherClient({ getDirect: vi.fn(async (_s: string, before?: string) => {
      if (before && fail) throw new Error("تعذر تحميل الرسائل الأقدم.");
      return before ? thread(range(1, 3, () => "student")) : thread(range(4, 6, () => "teacher"), { hasMore: true });
    }) });
    render(<TeacherMessagesPage token="t" client={client} />);
    await openSara();
    await screen.findByText("رسالة 6");
    fireEvent.click(screen.getByRole("button", { name: "عرض الرسائل الأقدم" }));
    expect((await screen.findByRole("alert")).textContent).toBe("تعذر تحميل الرسائل الأقدم.");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "عرض الرسائل الأقدم" }));
    await screen.findByText("رسالة 1");
  });
});

describe("teacher — replies held back by the frontier", () => {
  it("the note says newer replies follow while the server holds them back", async () => {
    const client = teacherClient({ getDirect: vi.fn(async () => thread(range(1, 3, () => "teacher"), { hasNewer: true })) });
    render(<TeacherMessagesPage token="t" client={client} />);
    await openSara();
    expect(await screen.findByText("توجد رسائل أحدث، تظهر تلقائيًا بعد قراءة الرسائل المعروضة.")).toBeTruthy();
  });
  it("hasNewer: the note is shown, and the acknowledgement of the shown replies reloads the thread at once", async () => {
    let calls = 0;
    const client = teacherClient({ getDirect: vi.fn(async () => (++calls === 1 ? thread(range(1, 3, () => "student"), { hasNewer: true }) : thread(range(1, 5, () => "student")))) });
    render(<TeacherMessagesPage token="t" client={client} />);
    await openSara();
    await screen.findByText("رسالة 3");
    await waitFor(() => expect(screen.getByText("رسالة 5")).toBeTruthy());           // no 5 s wait: reloaded after the mark
    expect((client.markDirectRead as ReturnType<typeof vi.fn>).mock.calls[0][1].throughMessageId).toBe(id(3));
    expect(screen.queryByText(/توجد رسائل أحدث/)).toBeNull();
  });
});

describe("student — older history and held-back messages", () => {
  const U = { directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false };
  it("each tab pages back on its own; a held-back direct page reloads after its acknowledgement", async () => {
    let loads = 0;
    const client: StudentMessagesClient = {
      load: vi.fn(async () => (++loads === 1
        ? { direct: range(2, 3, () => "teacher"), announcements: [msg(20, "teacher", "announcement")], classroom: { classId: "c1", name: "ص", archived: false }, canSend: true, readOnlyReason: "", directHasMore: true, directHasNewer: true, announcementsHasMore: true }
        : { direct: range(2, 4, () => "teacher"), announcements: [msg(20, "teacher", "announcement")], classroom: { classId: "c1", name: "ص", archived: false }, canSend: true, readOnlyReason: "", directHasMore: true, announcementsHasMore: true })),
      sendDirect: vi.fn(async (body: string) => ({ ...msg(50, "student"), body })),
      getUnread: vi.fn(async () => U), markRead: vi.fn(async () => U),
      loadOlder: vi.fn(async (stream: "direct" | "announcements") => (stream === "direct" ? { messages: [msg(1, "teacher")], hasMore: false } : { messages: [msg(19, "teacher", "announcement")], hasMore: false }))
    };
    render(<StudentMessagesPage token="t" onBack={() => {}} client={client} />);
    await screen.findByText("رسالة 3");
    await waitFor(() => expect(screen.getByText("رسالة 4")).toBeTruthy());           // reloaded after the mark
    expect(client.load).toHaveBeenCalledTimes(2);                                    // at once, not on the 5 s poll
    expect(screen.queryByText(/توجد رسائل أحدث/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "عرض الرسائل الأقدم" }));
    await screen.findByText("رسالة 1");
    expect(client.loadOlder).toHaveBeenLastCalledWith("direct", id(2));
    expect(screen.queryByRole("button", { name: "عرض الرسائل الأقدم" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /إعلانات الصف/ }));
    fireEvent.click(await screen.findByRole("button", { name: "عرض الرسائل الأقدم" }));
    await screen.findByText("رسالة 19");
    expect(client.loadOlder).toHaveBeenLastCalledWith("announcements", id(20));
    expect((client.markRead as ReturnType<typeof vi.fn>).mock.calls.every(c => c[1].throughMessageId !== id(1) && c[1].throughMessageId !== id(19))).toBe(true);
  });
  it("a client without loadOlder (older embedders) shows no history button", async () => {
    const client: StudentMessagesClient = {
      load: vi.fn(async () => ({ direct: [msg(2, "teacher")], announcements: [], classroom: null, canSend: false, readOnlyReason: "", directHasMore: true })),
      sendDirect: vi.fn(), getUnread: vi.fn(async () => U), markRead: vi.fn(async () => U)
    };
    render(<StudentMessagesPage token="t" onBack={() => {}} client={client} />);
    await screen.findByText("رسالة 2");
    expect(screen.queryByRole("button", { name: "عرض الرسائل الأقدم" })).toBeNull();
  });
});
