// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, within, waitFor } from "@testing-library/react";
import TeacherAppShell from "../shell/TeacherAppShell";
import TeacherMessagesPage from "./TeacherMessagesPage";
import type { TeacherMessagesClient, MessageView, ThreadState, UnreadCount } from "./messagesClient";
import type { Classroom, Student } from "../students/types";

// Phase 5D — teacher unread badges: the shell «الرسائل» badge (App-owned count) and the messages page's per-student
// «N جديدة» indicators + server-authoritative mark-read on a current, visible thread load.

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}

describe("TeacherAppShell — messages badge", () => {
  const nav = { teacherView: "platform" as const, workspaceTab: "dashboard" as const, projectCode: "", projectList: [] };
  const mount = (messageUnread?: { total: number; capped: boolean }, ready = 0) => render(
    <TeacherAppShell nav={nav} projectReadyTotal={ready} messageUnread={messageUnread} displayName="المعلم" onNavigate={() => {}} onLogout={() => {}}><p>x</p></TeacherAppShell>
  );
  const navBtn = (name: RegExp) => within(screen.getByRole("complementary", { name: "التنقل الرئيسي" })).getByRole("button", { name });
  it("0 → no badge; 3 → «3» + hidden «رسائل جديدة»; capped → «99+»; the project badge is unchanged", () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const a = mount({ total: 0, capped: false }, 2);
    expect(navBtn(/^الرسائل$/).querySelector(".eb-nav-badge")).toBeNull();
    expect(navBtn(/المشاريع/).textContent).toContain("2 مراحل بانتظار الفحص");
    a.unmount();
    const b = mount({ total: 3, capped: false });
    expect(navBtn(/الرسائل/).querySelector(".eb-nav-badge")?.textContent).toBe("3 رسائل جديدة");
    b.unmount();
    mount({ total: 99, capped: true });
    expect(navBtn(/الرسائل/).querySelector(".eb-nav-badge")?.textContent).toBe("99+ رسائل جديدة");
  });
});

const cls = (classId: string): Classroom => ({ classId, name: "الصف", grade: "11", schoolYear: "2026", active: true, studentCount: 2, createdAt: "" });
const stu = (userId: string, displayName: string, over: Partial<Student> = {}): Student => ({ userId, displayName, code: "", identityNumber: "", firstName: "", familyName: "", classId: "c1", active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0, ...over });
let seq = 0;
const msg = (body: string, senderRole: "teacher" | "student"): MessageView => ({ messageId: String(1800000000000 + ++seq) + "-aaaaaaaaaaaaaaaa", kind: "direct", senderRole, senderDisplayName: "س", body, createdAt: "" });
const thread = (messages: MessageView[]): ThreadState => ({ messages, canSend: true, readOnlyReason: "" });

function makeClient(over: Partial<TeacherMessagesClient> = {}): TeacherMessagesClient {
  return {
    listClasses: vi.fn(async () => [cls("c1")]),
    listStudents: vi.fn(async () => [stu("s1", "سارة"), stu("s2", "خالد"), stu("s3", "ليلى", { archived: true, active: false })]),
    getDirect: vi.fn(async () => thread([msg("رد", "student")])),
    getAnnouncements: vi.fn(async () => thread([])),
    sendDirect: vi.fn(async (_s: string, body: string) => msg(body, "teacher")),
    sendAnnouncement: vi.fn(async (_c: string, body: string) => msg(body, "teacher")),
    getClassUnread: vi.fn(async () => ({ totalUnread: 102, capped: true, byStudent: { s1: { unread: 3, capped: false }, s2: { unread: 99, capped: true }, s3: { unread: 1, capped: false } } })),
    markDirectRead: vi.fn(async () => ({ unread: 0, capped: false })),
    ...over
  };
}
async function openClass() {
  fireEvent.change(await screen.findByRole("combobox", { name: "الصف" }), { target: { value: "c1" } });
  return screen.findByRole("list", { name: "طلاب الصف" });
}
const row = (roster: HTMLElement, name: RegExp) => within(roster).getByRole("button", { name });

describe("TeacherMessagesPage — roster unread + mark read", () => {
  it("shows «N جديدة» per student (text, 99+ when capped), incl. an archived student's unread history", async () => {
    render(<TeacherMessagesPage token="t" client={makeClient()} />);
    const roster = await openClass();
    await waitFor(() => expect(row(roster, /سارة/).textContent).toContain("3 جديدة"));
    expect(row(roster, /خالد/).textContent).toContain("99+ جديدة");
    expect(row(roster, /ليلى/).textContent).toContain("1 جديدة");
  });

  it("a current, visible thread load marks through its latest id; the badge changes ONLY from the server response", async () => {
    const onUnreadChanged = vi.fn();
    const mark = deferred<UnreadCount>();
    const client = makeClient({ getDirect: vi.fn(async () => thread([msg("أول", "student"), msg("ثاني", "student")])), markDirectRead: vi.fn(() => mark.promise) });
    render(<TeacherMessagesPage token="t" client={client} onUnreadChanged={onUnreadChanged} />);
    const roster = await openClass();
    await waitFor(() => expect(row(roster, /سارة/).textContent).toContain("3 جديدة"));
    fireEvent.click(row(roster, /سارة/));
    await screen.findByText("ثاني");
    const lastId = (client.getDirect as ReturnType<typeof vi.fn>).mock.results[0].value;
    const shown = (await lastId).messages as MessageView[];
    expect(client.markDirectRead).toHaveBeenCalledWith("s1", shown[1].messageId);
    expect(row(roster, /سارة/).textContent).toContain("3 جديدة");               // not optimistic
    await act(async () => { mark.resolve({ unread: 1, capped: false }); });     // a reply arrived after the marked id
    expect(row(roster, /سارة/).textContent).toContain("1 جديدة");
    expect(onUnreadChanged).toHaveBeenCalledTimes(1);
  });

  it("a failed mark keeps the unread indicator", async () => {
    const client = makeClient({ markDirectRead: vi.fn(async () => { throw new Error("x"); }) });
    render(<TeacherMessagesPage token="t" client={client} />);
    const roster = await openClass();
    await waitFor(() => expect(row(roster, /سارة/).textContent).toContain("3 جديدة"));
    fireEvent.click(row(roster, /سارة/));
    await screen.findByText("رد");
    await waitFor(() => expect(client.markDirectRead).toHaveBeenCalled());
    expect(row(roster, /سارة/).textContent).toContain("3 جديدة");
  });

  it("a STALE response for student A (after selecting B) never marks A read", async () => {
    const a = deferred<ThreadState>(), b = deferred<ThreadState>();
    const client = makeClient({ getDirect: vi.fn((id: string) => (id === "s1" ? a.promise : b.promise)) });
    render(<TeacherMessagesPage token="t" client={client} />);
    const roster = await openClass();
    fireEvent.click(row(roster, /سارة/));
    fireEvent.click(row(roster, /خالد/));
    const bMsg = msg("رسالة خالد", "student");
    await act(async () => { b.resolve(thread([bMsg])); });
    await act(async () => { a.resolve(thread([msg("رسالة سارة", "student")])); });
    expect(client.markDirectRead).toHaveBeenCalledTimes(1);
    expect(client.markDirectRead).toHaveBeenCalledWith("s2", bMsg.messageId);
  });

  it("an archived student's unread history can be opened and marked", async () => {
    const client = makeClient();
    render(<TeacherMessagesPage token="t" client={client} />);
    const roster = await openClass();
    await waitFor(() => expect(row(roster, /ليلى/).textContent).toContain("1 جديدة"));
    fireEvent.click(row(roster, /ليلى/));
    await waitFor(() => expect(client.markDirectRead).toHaveBeenCalledWith("s3", expect.any(String)));
    await waitFor(() => expect(row(roster, /ليلى/).textContent).not.toContain("جديدة"));
  });

  it("the class summary refreshes every ~15s while a class is selected, and stops on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = makeClient();
    const view = render(<TeacherMessagesPage token="t" client={client} />);
    await openClass();
    const summary = client.getClassUnread as ReturnType<typeof vi.fn>;
    await waitFor(() => expect(summary).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(summary).toHaveBeenCalledTimes(2);
    view.unmount();
    summary.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(45000); });
    expect(summary).not.toHaveBeenCalled();
  });
});
