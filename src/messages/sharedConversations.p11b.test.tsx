// @vitest-environment happy-dom
// Tadris+ P11-B — a separate conversation per teacher, on the screens (test data only). The server is the authority
// (api/tests/shared-messaging-p11b.test.js); here: the teacher's client names the conversation of a student shared from another
// teacher's class and never of the teacher's own student; the student's page lists «معلموك» only when there is more than one
// conversation and each conversation talks to the server with its own `conversation`; the owner reads a shared conversation by class.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StudentMessagesPage from "./StudentMessagesPage";
import { createTeacherMessagesClient, createStudentMessagesClient } from "./messagesClient";
import OwnerConversation from "../owner/OwnerConversation";
import OwnerClassRoster from "../owner/OwnerClassRoster";
import type { ApiResult } from "../owner/ownerApi";

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[] = [];
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
function stub(reply: (c: Call) => unknown) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: String(init.method || "GET"), body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    return json(200, reply(c));
  }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const MSG = (id: string, senderRole: string, body: string) => ({ messageId: id, kind: "direct", senderRole, senderDisplayName: senderRole === "teacher" ? "أ." : "ليان", body, createdAt: "2026-11-11T08:00:00.000Z" });
const ACK = { throughMessageId: "9000000000001-aaaaaaaaaaaaaaaa", seenIdsAtBoundary: ["9000000000001-aaaaaaaaaaaaaaaa"] };

describe("P11-B the teacher's client names the conversation of a shared student", () => {
  const roster = (classId: string) => ({ ok: true, students: classId === "cB" ? [{ userId: "u1", displayName: "ليان", classId: "cB", shared: true }, { userId: "u2", displayName: "كريم", classId: "cB" }] : [{ userId: "u1", displayName: "ليان", classId }] });
  it("every call about the shared student carries `conversation`; the teacher's own student never does", async () => {
    stub(c => (c.url.startsWith("/api/students") ? roster(new URL(c.url, "https://x").searchParams.get("classId") || "") : { ok: true, messages: [], message: MSG("9000000000001-aaaaaaaaaaaaaaaa", "teacher", "x"), unread: 0 }));
    const client = createTeacherMessagesClient("tok");
    await client.listStudents("cB");
    await client.getDirect("u1");
    await client.getDirect("u1", "9000000000001-aaaaaaaaaaaaaaaa");
    await client.sendDirect("u1", "مرحبًا", "key-1");
    await client.markDirectRead("u1", ACK);
    await client.editMessage?.({ studentId: "u1" }, "9000000000001-aaaaaaaaaaaaaaaa", "تعديل");
    await client.deleteMessage?.({ studentId: "u1" }, "9000000000001-aaaaaaaaaaaaaaaa");
    await client.getDirect("u2");
    await client.sendDirect("u2", "مرحبًا");
    await client.deleteMessage?.({ classId: "cB" }, "9000000000001-aaaaaaaaaaaaaaaa");
    const gets = calls.filter(c => c.method === "GET" && c.url.startsWith("/api/messages")).map(c => c.url);
    expect(gets).toEqual(["/api/messages?studentId=u1&conversation=cB", "/api/messages?studentId=u1&conversation=cB&before=9000000000001-aaaaaaaaaaaaaaaa", "/api/messages?studentId=u2"]);
    const posts = calls.filter(c => c.method === "POST").map(c => [c.body?.action, c.body?.studentId, c.body?.conversation]);
    expect(posts).toEqual([["sendDirect", "u1", "cB"], ["markDirectRead", "u1", "cB"], ["editMessage", "u1", "cB"], ["deleteMessage", "u1", "cB"], ["sendDirect", "u2", undefined], ["deleteMessage", undefined, undefined]]);
  });
  it("the same student listed again as the teacher's OWN (their home class) goes back to the home conversation", async () => {
    stub(c => (c.url.startsWith("/api/students") ? roster(new URL(c.url, "https://x").searchParams.get("classId") || "") : { ok: true, messages: [] }));
    const client = createTeacherMessagesClient("tok");
    await client.listStudents("cB");
    await client.listStudents("cA");                                   // u1 is listed there without `shared`
    await client.getDirect("u1");
    expect(calls[calls.length - 1].url).toBe("/api/messages?studentId=u1");
  });
});

describe("P11-B the student's client is one conversation", () => {
  it("a conversation's client names it on every request; the default client never does", async () => {
    stub(() => ({ ok: true, direct: [], announcements: [], classroom: null, canSend: true, message: MSG("9000000000001-aaaaaaaaaaaaaaaa", "student", "x"), messages: [] }));
    const shared = createStudentMessagesClient("tok", "cB"), home = createStudentMessagesClient("tok");
    await shared.load(); await shared.getUnread(); await shared.loadOlder?.("direct", "9000000000001-aaaaaaaaaaaaaaaa");
    await shared.sendDirect("رد", "key-1"); await shared.markRead("direct", ACK); await shared.editMessage?.("9000000000001-aaaaaaaaaaaaaaaa", "تعديل"); await shared.deleteMessage?.("9000000000001-aaaaaaaaaaaaaaaa");
    const sharedCalls = calls.slice();
    expect(sharedCalls.filter(c => c.method === "GET").map(c => c.url)).toEqual(["/api/student-messages?conversation=cB", "/api/student-messages?view=unread&conversation=cB", "/api/student-messages?stream=direct&before=9000000000001-aaaaaaaaaaaaaaaa&conversation=cB"]);
    expect(sharedCalls.filter(c => c.method === "POST").every(c => c.body?.conversation === "cB")).toBe(true);
    calls = [];
    await home.load(); await home.getUnread(); await home.sendDirect("رد");
    expect(calls.map(c => c.url)).toEqual(["/api/student-messages", "/api/student-messages?view=unread", "/api/student-messages"]);
    expect(calls[2].body).toEqual({ action: "sendDirect", body: "رد" });
  });
});

describe("P11-B the student's messages page: «معلموك»", () => {
  const CONVERSATIONS = [{ id: "", home: true, selected: true, name: "صف سارة", archived: false, unread: 0, capped: false, teacherName: "أ. سارة" }, { id: "cB", home: false, selected: false, name: "صف عمر", archived: false, unread: 2, capped: false, teacherName: "أ. عمر" }];
  const reply = (multi: boolean) => (c: Call) => {
    const shared = c.url.includes("conversation=cB") || c.body?.conversation === "cB";
    const list = multi ? { conversation: shared ? "cB" : "", conversations: CONVERSATIONS.map(x => ({ ...x, selected: (x.id === "cB") === shared })) } : {};
    if (c.url.includes("view=unread")) return { ok: true, directUnread: { unread: shared ? 2 : 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 2, totalCapped: false, ...(multi ? { conversations: CONVERSATIONS } : {}) };
    if (c.method === "POST" && c.body?.action === "sendDirect") return { ok: true, message: MSG("9000000000009-bbbbbbbbbbbbbbbb", "student", String(c.body.body)) };
    // markRead: this conversation's shown messages are read; the total still counts the OTHER conversation's two unread messages
    if (c.method === "POST") return { ok: true, stream: "direct", unread: 0, capped: false, directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: shared ? 0 : 2, totalCapped: false };
    return { ok: true, direct: [MSG("9000000000001-aaaaaaaaaaaaaaaa", "teacher", shared ? "من معلم الصف الثاني" : "من معلمتي الأولى")], announcements: [], classroom: { classId: shared ? "cB" : "cA", name: shared ? "صف عمر" : "صف سارة", archived: false }, canSend: true, readOnlyReason: "", ...list };
  };
  it("one conversation: no switcher, and no request names a conversation", async () => {
    stub(reply(false));
    render(<StudentMessagesPage token="tok" onBack={() => {}} />);
    await screen.findByText("من معلمتي الأولى");
    expect(screen.queryByRole("group", { name: "معلموك" })).toBeNull();
    expect(calls.every(c => !c.url.includes("conversation") && c.body?.conversation === undefined)).toBe(true);
  });
  it("two conversations: the switcher names each teacher with the other's unread count; choosing one shows ITS messages and sends there", async () => {
    stub(reply(true));
    const onUnread = vi.fn();
    render(<StudentMessagesPage token="tok" onBack={() => {}} onUnreadChange={onUnread} />);
    await screen.findByText("من معلمتي الأولى");
    const group = await screen.findByRole("group", { name: "معلموك" });
    const [home, other] = within(group).getAllByRole("button");
    expect([home.getAttribute("aria-pressed"), other.getAttribute("aria-pressed")]).toEqual(["true", "false"]);
    expect(home.textContent).toContain("أ. سارة — صف سارة");
    expect(other.textContent).toContain("أ. عمر — صف عمر");
    expect(other.textContent).toContain("2 غير مقروءة");
    await waitFor(() => expect(onUnread).toHaveBeenCalled());
    expect(onUnread.mock.calls.at(-1)?.[0].totalUnread).toBe(2);                                // the portal's badge: every conversation
    fireEvent.click(other);
    await screen.findByText("من معلم الصف الثاني");
    expect(screen.queryByText("من معلمتي الأولى")).toBeNull();                                  // nothing of the other conversation stays
    expect(within(screen.getByRole("group", { name: "معلموك" })).getAllByRole("button")[1].getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByLabelText("رسالتك إلى المعلم"), { target: { value: "شكرًا أستاذ" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));
    await waitFor(() => expect(calls.some(c => c.method === "POST" && c.body?.action === "sendDirect")).toBe(true));
    expect(calls.find(c => c.method === "POST" && c.body?.action === "sendDirect")?.body).toMatchObject({ conversation: "cB", body: "شكرًا أستاذ" });
  });
});

describe("P11-B the owner reads a shared student's conversation with that class's teacher", () => {
  const send = async <T,>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void) => { const r = await call(); if (r.ok) onOk(r.data); };
  it("the opening names the class; without it the request is the home conversation's, as before", async () => {
    stub(() => ({ ok: true, student: { userId: "u1", displayName: "ليان" }, messages: [], hasMore: false }));
    const { unmount } = render(<OwnerConversation token="owner-tok" studentId="u1" studentName="ليان" busy={false} send={send} onClose={() => {}} conversation="cB" />);
    expect(screen.getByRole("note").textContent).toContain("محادثة الطالب مع معلم هذا الصف فقط");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "شكوى من ولي الأمر" } });
    fireEvent.click(screen.getByRole("button", { name: "فتح المحادثة (قراءة فقط)" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ studentId: "u1", reason: "شكوى من ولي الأمر", conversation: "cB" });
    unmount();
    render(<OwnerConversation token="owner-tok" studentId="u1" studentName="ليان" busy={false} send={send} onClose={() => {}} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "شكوى من ولي الأمر" } });
    fireEvent.click(screen.getByRole("button", { name: "فتح المحادثة (قراءة فقط)" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].body).toEqual({ studentId: "u1", reason: "شكوى من ولي الأمر" });
  });
});

describe("P11-B the owner's class roster wires the shared conversation", () => {
  const send = async <T,>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void) => { const r = await call(); if (r.ok) onOk(r.data); };
  it("«الاطلاع على المحادثة» on a shared student opens THIS class's conversation; on the class's own student, the home one", async () => {
    stub(c => (c.url.startsWith("/api/owner-classes/students")
      ? { ok: true, classId: "cB", students: [{ userId: "u1", displayName: "ليان سعيد", identityNumber: "300000001", active: true, archived: false, shared: true }, { userId: "u2", displayName: "كريم ناصر", identityNumber: "300000002", active: true, archived: false }] }
      : { ok: true, student: { userId: "u", displayName: "" }, messages: [], hasMore: false }));
    render(<OwnerClassRoster token="owner-tok" classId="cB" className="علوم الحاسوب" ownerAccountId="t_00112233445566bb" busy={false} send={send} onChanged={() => {}} />);
    for (const name of ["ليان سعيد", "كريم ناصر"]) {
      const row = await screen.findByRole("listitem", { name });
      fireEvent.click(within(row).getByRole("button", { name: "الاطلاع على المحادثة" }));
      const region = within(row).getByRole("region", { name: "محادثة " + name });
      fireEvent.change(within(region).getByRole("textbox"), { target: { value: "شكوى من ولي الأمر" } });
      fireEvent.click(within(region).getByRole("button", { name: "فتح المحادثة (قراءة فقط)" }));
    }
    await waitFor(() => expect(calls.filter(c => c.method === "POST")).toHaveLength(2));
    expect(calls.filter(c => c.method === "POST").map(c => [c.body?.studentId, c.body?.conversation])).toEqual([["u1", "cB"], ["u2", undefined]]);
  });
});
