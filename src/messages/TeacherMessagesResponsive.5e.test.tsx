// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, within, waitFor } from "@testing-library/react";
import TeacherMessagesPage from "./TeacherMessagesPage";
import StudentMessagesPage from "./StudentMessagesPage";
import { MessageThread } from "./MessageParts";
import { isConversationVisible, isNearBottom, messagesPane, shouldScrollToNewest, WIDE_LAYOUT_QUERY } from "./messagesLayout";
import type { TeacherMessagesClient, MessageView, ThreadState, StudentMessagesClient } from "./messagesClient";
import type { Classroom, Student } from "../students/types";

// Phase 5E — responsive teacher messaging workspace. Presentation only: these tests pin that the wide/narrow panes,
// the conversation header, the back navigation and the chat scrolling never change WHAT is selected, loaded, polled,
// drafted or acknowledged. The viewport is driven through a controllable matchMedia (no pixel assertions).

const realMatchMedia = window.matchMedia;
function viewport(wide: boolean) {
  let current = wide;
  const listeners = new Set<() => void>();
  window.matchMedia = ((q: string) => ({
    get matches() { return q === WIDE_LAYOUT_QUERY ? current : false; },
    media: q,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l)
  })) as unknown as typeof window.matchMedia;
  return { resize(nextWide: boolean) { current = nextWide; act(() => listeners.forEach(l => l())); } };
}
beforeEach(() => { viewport(true); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); window.matchMedia = realMatchMedia; });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const cls = (classId: string, name: string, over: Partial<Classroom> = {}): Classroom => ({ classId, name, grade: "11", schoolYear: "2026", active: true, studentCount: 3, createdAt: "", ...over });
const stu = (userId: string, displayName: string, over: Partial<Student> = {}): Student => ({ userId, displayName, code: "", identityNumber: "", firstName: "", familyName: "", classId: "c1", active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0, ...over });
let seq = 0;
const msg = (body: string, senderRole: "teacher" | "student", name = senderRole === "teacher" ? "أ. أحمد" : "سارة"): MessageView =>
  ({ messageId: String(9000000000000 + ++seq) + "-aaaaaaaaaaaaaaaa", kind: "direct", senderRole, senderDisplayName: name, body, createdAt: new Date(1700000000000 + seq * 1000).toISOString() });
const thread = (messages: MessageView[], canSend = true, readOnlyReason = ""): ThreadState => ({ messages, canSend, readOnlyReason });

function makeClient(over: Partial<TeacherMessagesClient> = {}): TeacherMessagesClient {
  return {
    listClasses: vi.fn(async () => [cls("c1", "الحادي عشر")]),
    listStudents: vi.fn(async () => [stu("s1", "سارة"), stu("s2", "خالد", { active: false }), stu("s3", "ليلى", { archived: true })]),
    getDirect: vi.fn(async (id: string) => id === "s3"
      ? thread([msg("قديمة", "teacher")], false, "هذا الطالب مؤرشف. المحادثة السابقة متاحة للقراءة فقط.")
      : thread([msg("مرحبا", "teacher"), msg("أهلًا أستاذ", "student")])),
    getAnnouncements: vi.fn(async () => thread([{ ...msg("اختبار الأحد", "teacher"), kind: "announcement" as const }])),
    sendDirect: vi.fn(async (_s: string, body: string) => msg(body, "teacher")),
    sendAnnouncement: vi.fn(async (_c: string, body: string) => ({ ...msg(body, "teacher"), kind: "announcement" as const })),
    getClassUnread: vi.fn(async () => ({ totalUnread: 0, capped: false, byStudent: {} })),
    markDirectRead: vi.fn(async () => ({ unread: 0, capped: false })),
    ...over
  };
}
async function openClass() {
  fireEvent.change(await screen.findByRole("combobox", { name: "الصف" }), { target: { value: "c1" } });
  return screen.findByRole("list", { name: "طلاب الصف" });
}
const pick = (roster: HTMLElement, name: RegExp) => fireEvent.click(within(roster).getByRole("button", { name }));
const workspace = () => document.querySelector(".eb-msg-workspace") as HTMLElement;
const rosterPane = () => document.querySelector(".eb-msg-roster") as HTMLElement;
const convoPane = () => document.querySelector(".eb-msg-conversation") as HTMLElement;
const header = () => document.querySelector(".eb-msg-convo-head") as HTMLElement;
const directCalls = (c: TeacherMessagesClient) => (c.getDirect as ReturnType<typeof vi.fn>).mock.calls.map(a => a[0]);

describe("desktop (≥900px): roster + conversation side by side", () => {
  it("both panes on screen; empty state until a student is picked; no back control", async () => {
    render(<TeacherMessagesPage token="t" client={makeClient()} />);
    await openClass();
    expect(workspace().dataset.pane).toBe("split");
    expect(rosterPane().classList.contains("is-offscreen")).toBe(false);
    expect(convoPane().classList.contains("is-offscreen")).toBe(false);
    expect(screen.getByText("اختر طالبًا لعرض المحادثة.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "رجوع إلى قائمة الطلاب" })).toBeNull();
  });

  it("the conversation header shows the selected student's name + status and follows a switch", async () => {
    const client = makeClient();
    render(<TeacherMessagesPage token="t" client={client} />);
    const roster = await openClass();
    pick(roster, /سارة/);
    await screen.findByText("أهلًا أستاذ");
    expect(within(header()).getByRole("heading", { level: 3, name: "المحادثة مع سارة" })).toBeTruthy();
    expect(within(header()).getByText("نشط")).toBeTruthy();
    pick(roster, /خالد/);
    await waitFor(() => expect(within(header()).getByRole("heading", { name: "المحادثة مع خالد" })).toBeTruthy());
    expect(within(header()).getByText("معطّل")).toBeTruthy();
    pick(roster, /ليلى/);
    await screen.findByText("قديمة");
    expect(within(header()).getByText("مؤرشف")).toBeTruthy();
    expect(screen.getByText("هذا الطالب مؤرشف. المحادثة السابقة متاحة للقراءة فقط.")).toBeTruthy();   // server reason
    expect(screen.queryByRole("textbox")).toBeNull();                                               // canSend=false
    expect(directCalls(client)).toEqual(["s1", "s2", "s3"]);                                        // one GET per switch
  });

  it("mine/theirs come from the sender role (teacher = mine), with visible sender labels", async () => {
    render(<TeacherMessagesPage token="t" client={makeClient()} />);
    pick(await openClass(), /سارة/);
    const list = await screen.findByRole("list", { name: "المحادثة" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0].className).toContain("is-mine");
    expect(within(items[0]).getByText("أنت")).toBeTruthy();
    expect(items[1].className).toContain("is-theirs");
    expect(within(items[1]).getByText("سارة")).toBeTruthy();
  });

  it("composer: one send per click burst, textarea keeps its label and 2000 limit", async () => {
    const pending = deferred<MessageView>();
    const client = makeClient({ sendDirect: vi.fn(() => pending.promise) });
    render(<TeacherMessagesPage token="t" client={client} />);
    pick(await openClass(), /سارة/);
    await screen.findByText("أهلًا أستاذ");
    const box = screen.getByRole("textbox", { name: "رسالة إلى الطالب" }) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(2000);
    fireEvent.change(box, { target: { value: "واجب الغد" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));
    fireEvent.click(screen.getByRole("button", { name: "جارٍ الإرسال..." }));
    fireEvent.submit(box.form as HTMLFormElement);
    expect(client.sendDirect).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(msg("واجب الغد", "teacher")); });
    await waitFor(() => expect(within(screen.getByRole("list", { name: "المحادثة" })).getByText("واجب الغد")).toBeTruthy());
  });

  it("announcements: same chat card, header with the class, composer, no roster", async () => {
    const client = makeClient();
    render(<TeacherMessagesPage token="t" client={client} />);
    await openClass();
    fireEvent.click(screen.getByRole("tab", { name: "إعلانات الصف" }));
    await screen.findByText("اختبار الأحد");
    expect(document.querySelector(".eb-msg-workspace.is-announcements")).toBeTruthy();
    expect(document.querySelector(".eb-msg-roster")).toBeNull();
    expect(within(header()).getByRole("heading", { name: "إعلانات الصف" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "إعلان جديد للصف" }), { target: { value: "لا دوام" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال إعلان للصف" }));
    await waitFor(() => expect(client.sendAnnouncement).toHaveBeenCalledWith("c1", "لا دوام"));
  });
});

describe("narrow (<900px): one pane at a time", () => {
  it("roster first → tap opens the conversation → back returns; selection, thread and draft are kept", async () => {
    viewport(false);
    const client = makeClient();
    render(<TeacherMessagesPage token="t" client={client} />);
    const roster = await openClass();
    expect(workspace().dataset.pane).toBe("roster");
    expect(convoPane().classList.contains("is-offscreen")).toBe(true);
    pick(roster, /سارة/);
    await screen.findByText("أهلًا أستاذ");
    expect(workspace().dataset.pane).toBe("conversation");
    expect(rosterPane().classList.contains("is-offscreen")).toBe(true);
    const back = screen.getByRole("button", { name: "رجوع إلى قائمة الطلاب" });
    expect(document.activeElement).toBe(back);                                        // focus moved into the chat
    fireEvent.change(screen.getByRole("textbox", { name: "رسالة إلى الطالب" }), { target: { value: "مسودة" } });

    fireEvent.click(back);
    expect(workspace().dataset.pane).toBe("roster");
    expect(within(roster).getByRole("button", { name: /سارة/, pressed: true })).toBeTruthy();
    expect(document.activeElement).toBe(within(roster).getByRole("button", { name: /سارة/ }));

    pick(roster, /سارة/);                                                            // same student again
    expect(workspace().dataset.pane).toBe("conversation");
    expect((screen.getByRole("textbox", { name: "رسالة إلى الطالب" }) as HTMLTextAreaElement).value).toBe("مسودة");
    expect(screen.getByText("أهلًا أستاذ")).toBeTruthy();                              // thread not cleared
    await waitFor(() => expect(directCalls(client)).toEqual(["s1", "s1"]));          // one silent refresh, no switch

    fireEvent.click(screen.getByRole("button", { name: "رجوع إلى قائمة الطلاب" }));
    pick(roster, /خالد/);                                                            // a different student = a real switch
    await waitFor(() => expect(within(header()).getByRole("heading", { name: "المحادثة مع خالد" })).toBeTruthy());
    expect((screen.getByRole("textbox", { name: "رسالة إلى الطالب" }) as HTMLTextAreaElement).value).toBe("");
  });

  it("the conversation is NOT polled while the roster is on screen, and polling resumes when it is shown again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    viewport(false);
    const client = makeClient();
    render(<TeacherMessagesPage token="t" client={client} />);
    pick(await openClass(), /سارة/);
    await screen.findByText("أهلًا أستاذ");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(directCalls(client).length).toBe(2);                                      // open + one 5s poll
    fireEvent.click(screen.getByRole("button", { name: "رجوع إلى قائمة الطلاب" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(directCalls(client).length).toBe(2);                                      // hidden thread → no polling
    expect((client.getClassUnread as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);   // 15s summary untouched
    pick(within(document.body).getByRole("list", { name: "طلاب الصف" }), /سارة/);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(directCalls(client)).toEqual(["s1", "s1", "s1", "s1"]);                   // refresh on reopen + poll; only s1
  });

  it("a load that resolves after «back» is NOT acknowledged; re-opening acknowledges from a fresh snapshot", async () => {
    viewport(false);
    const first = deferred<ThreadState>();
    let n = 0;
    const client = makeClient({ getDirect: vi.fn(() => (++n === 1 ? first.promise : Promise.resolve(thread([msg("جديدة", "student")])))) });
    render(<TeacherMessagesPage token="t" client={client} />);
    const roster = await openClass();
    pick(roster, /سارة/);
    fireEvent.click(screen.getByRole("button", { name: "رجوع إلى قائمة الطلاب" }));
    await act(async () => { first.resolve(thread([msg("رد الطالب", "student")])); });
    expect(client.markDirectRead).not.toHaveBeenCalled();                           // roster on screen → not visible
    pick(roster, /سارة/);
    await waitFor(() => expect(client.markDirectRead).toHaveBeenCalledTimes(1));
    expect((client.markDirectRead as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("s1");
  });

  it("resizing keeps the selected conversation and the draft, without reloading", async () => {
    const vp = viewport(true);
    const client = makeClient();
    render(<TeacherMessagesPage token="t" client={client} />);
    pick(await openClass(), /سارة/);
    await screen.findByText("أهلًا أستاذ");
    fireEvent.change(screen.getByRole("textbox", { name: "رسالة إلى الطالب" }), { target: { value: "نص" } });
    vp.resize(false);
    expect(workspace().dataset.pane).toBe("conversation");
    expect(screen.getByRole("button", { name: "رجوع إلى قائمة الطلاب" })).toBeTruthy();
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "رجوع إلى قائمة الطلاب" }));   // no focus theft on resize
    vp.resize(true);
    expect(workspace().dataset.pane).toBe("split");
    expect((screen.getByRole("textbox", { name: "رسالة إلى الطالب" }) as HTMLTextAreaElement).value).toBe("نص");
    expect(directCalls(client)).toEqual(["s1"]);
  });

  it("changing the class returns a narrow screen to the roster (selection is cleared by the existing class switch)", async () => {
    viewport(false);
    render(<TeacherMessagesPage token="t" client={makeClient({ listClasses: vi.fn(async () => [cls("c1", "أ"), cls("c2", "ب")]) })} />);
    pick(await openClass(), /سارة/);
    await screen.findByText("أهلًا أستاذ");
    fireEvent.change(screen.getByRole("combobox", { name: "الصف" }), { target: { value: "c2" } });
    expect(workspace().dataset.pane).toBe("roster");
  });
});

describe("chat scrolling (MessageThread followKey)", () => {
  function metrics(el: HTMLElement, m: { scrollHeight: number; clientHeight: number }) {
    Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => m.scrollHeight });
    Object.defineProperty(el, "clientHeight", { configurable: true, get: () => m.clientHeight });
  }
  const props = { labelFor: (x: MessageView) => x.senderRole, isMine: (x: MessageView) => x.senderRole === "teacher", emptyText: "-", ariaLabel: "t" };
  const a = msg("أ", "student"), b = msg("ب", "teacher"), c = msg("ج", "student"), d = msg("د", "teacher");

  it("opens at the newest; a poll while reading older history keeps the position; at the bottom it follows; own send and a new thread jump to newest", () => {
    const m = { scrollHeight: 1000, clientHeight: 300 };
    const Probe = ({ list, k }: { list: MessageView[]; k: string }) => <MessageThread {...props} messages={list} followKey={k} />;
    const view = render(<Probe list={[a, b]} k="dm:s1" />);
    const el = screen.getByRole("list", { name: "t" });
    metrics(el, m);
    view.rerender(<Probe list={[a, b]} k="dm:s1" />);
    m.scrollHeight = 1000; el.scrollTop = 0;
    view.rerender(<Probe list={[a, b]} k="dm:s2" />);                                 // switch → newest
    expect(el.scrollTop).toBe(1000);

    el.scrollTop = 100; fireEvent.scroll(el);                                         // reader scrolls up
    m.scrollHeight = 1200;
    view.rerender(<Probe list={[a, b, c]} k="dm:s2" />);                              // poll adds THEIR message
    expect(el.scrollTop).toBe(100);

    view.rerender(<Probe list={[a, b, c, d]} k="dm:s2" />);                           // own message (successful send)
    expect(el.scrollTop).toBe(1200);

    el.scrollTop = 900; fireEvent.scroll(el);                                         // at the bottom (1200-900-300=0)
    m.scrollHeight = 1400;
    view.rerender(<Probe list={[a, b, c, d, msg("هـ", "student")]} k="dm:s2" />);
    expect(el.scrollTop).toBe(1400);
  });

  it("decision helpers", () => {
    expect(shouldScrollToNewest({ threadChanged: true, wasNearBottom: false, newestChanged: false, newestIsMine: false })).toBe(true);
    expect(shouldScrollToNewest({ threadChanged: false, wasNearBottom: false, newestChanged: true, newestIsMine: true })).toBe(true);
    expect(shouldScrollToNewest({ threadChanged: false, wasNearBottom: false, newestChanged: true, newestIsMine: false })).toBe(false);
    expect(shouldScrollToNewest({ threadChanged: false, wasNearBottom: true, newestChanged: true, newestIsMine: false })).toBe(true);
    expect(isNearBottom({ scrollTop: 620, scrollHeight: 1000, clientHeight: 300 })).toBe(true);
    expect(isNearBottom({ scrollTop: 500, scrollHeight: 1000, clientHeight: 300 })).toBe(false);
    expect(messagesPane(true, false, "roster")).toBe("split");
    expect(messagesPane(false, false, "conversation")).toBe("roster");
    expect(messagesPane(false, true, "conversation")).toBe("conversation");
    expect(messagesPane(false, true, "roster")).toBe("roster");
    expect(isConversationVisible("roster")).toBe(false);
    expect(isConversationVisible("split")).toBe(true);
  });

  it("the student page is unchanged: its thread is not a follow/scroll region", async () => {
    const U = { directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false };
    const client: StudentMessagesClient = {
      load: vi.fn(async () => ({ direct: [msg("مرحبا", "teacher")], announcements: [], classroom: { classId: "c1", name: "ص", archived: false }, canSend: true, readOnlyReason: "" })),
      sendDirect: vi.fn(async (body: string) => msg(body, "student")), getUnread: vi.fn(async () => U), markRead: vi.fn(async () => U)
    };
    render(<StudentMessagesPage token="t" onBack={() => {}} client={client} />);
    const list = await screen.findByRole("list", { name: "المحادثة مع المعلم" });
    expect(list.getAttribute("tabindex")).toBeNull();
    expect(document.querySelector(".eb-msg-workspace")).toBeNull();
  });
});
