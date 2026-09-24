// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, within, waitFor } from "@testing-library/react";
import TeacherMessagesPage from "./TeacherMessagesPage";
import StudentMessagesPage from "./StudentMessagesPage";
import { readAckFromSnapshot, type MessageView, type TeacherMessagesClient, type StudentMessagesClient } from "./messagesClient";
import type { Classroom, Student } from "../students/types";

// Phase 5D review follow-up — the mark-read acknowledgement comes from the APPLIED snapshot and only from the reader's
// unread-RELEVANT messages (teacher ← student messages; student ← teacher messages; any announcement).

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const m = (id: string, senderRole: "teacher" | "student", kind: "direct" | "announcement" = "direct"): MessageView => ({ messageId: id, kind, senderRole, senderDisplayName: "x", body: "b-" + id, createdAt: "" });
const T = "1800000000777";

describe("readAckFromSnapshot", () => {
  it("latest relevant id + every relevant snapshot id at its millisecond; irrelevant roles ignored; none → null", () => {
    const snap = [m(T + "-1111111111111111", "student"), m(T + "-8888888888888888", "student"), m("1800000000778-2222222222222222", "teacher"), m("1800000000700-5555555555555555", "student")];
    expect(readAckFromSnapshot(snap, x => x.senderRole === "student")).toEqual({ throughMessageId: T + "-8888888888888888", seenIdsAtBoundary: [T + "-1111111111111111", T + "-8888888888888888"] });
    expect(readAckFromSnapshot([m(T + "-1111111111111111", "teacher")], x => x.senderRole === "student")).toBeNull();
    expect(readAckFromSnapshot([], () => true)).toBeNull();
  });
});

const cls: Classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026", active: true, studentCount: 1, createdAt: "" };
const stu: Student = { userId: "s1", displayName: "سارة", code: "", identityNumber: "", firstName: "", familyName: "", classId: "c1", active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0 };
function teacherClient(messages: MessageView[]): TeacherMessagesClient {
  return {
    listClasses: vi.fn(async () => [cls]), listStudents: vi.fn(async () => [stu]),
    getDirect: vi.fn(async () => ({ messages, canSend: true, readOnlyReason: "" })), getAnnouncements: vi.fn(async () => ({ messages: [], canSend: true, readOnlyReason: "" })),
    sendDirect: vi.fn(async () => m("1900000000000-aaaaaaaaaaaaaaaa", "teacher")), sendAnnouncement: vi.fn(async () => m("1900000000000-bbbbbbbbbbbbbbbb", "teacher", "announcement")),
    getClassUnread: vi.fn(async () => ({ totalUnread: 0, capped: false, byStudent: {} })), markDirectRead: vi.fn(async () => ({ unread: 0, capped: false }))
  };
}
async function openStudent(client: TeacherMessagesClient, lastBody: string) {
  render(<TeacherMessagesPage token="t" client={client} />);
  fireEvent.change(await screen.findByRole("combobox", { name: "الصف" }), { target: { value: "c1" } });
  fireEvent.click(within(await screen.findByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /سارة/ }));
  await screen.findByText(lastBody);
}

describe("teacher acknowledgement — student messages only", () => {
  it("snapshot [student S1, teacher T1 (later)] → acknowledges S1, not T1", async () => {
    const S1 = m("1800000000001-aaaaaaaaaaaaaaaa", "student"), T1 = m("1800000000002-bbbbbbbbbbbbbbbb", "teacher");
    const c = teacherClient([S1, T1]);
    await openStudent(c, "b-" + T1.messageId);
    await waitFor(() => expect(c.markDirectRead).toHaveBeenCalledWith("s1", { throughMessageId: S1.messageId, seenIdsAtBoundary: [S1.messageId] }));
  });
  it("same-ms student messages in the snapshot are all acknowledged", async () => {
    const A = m(T + "-1111111111111111", "student"), B = m(T + "-8888888888888888", "student");
    const c = teacherClient([A, B]);
    await openStudent(c, "b-" + B.messageId);
    await waitFor(() => expect(c.markDirectRead).toHaveBeenCalledWith("s1", { throughMessageId: B.messageId, seenIdsAtBoundary: [A.messageId, B.messageId] }));
  });
  it("a thread with only the teacher's own messages is never marked", async () => {
    const c = teacherClient([m("1800000000001-aaaaaaaaaaaaaaaa", "teacher")]);
    await openStudent(c, "b-1800000000001-aaaaaaaaaaaaaaaa");
    await new Promise(r => setTimeout(r, 20));
    expect(c.markDirectRead).not.toHaveBeenCalled();
  });
});

describe("student acknowledgement — teacher messages only", () => {
  const U = { directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false };
  const client = (direct: MessageView[]): StudentMessagesClient => ({
    load: vi.fn(async () => ({ direct, announcements: [], classroom: { classId: "c1", name: "الصف", archived: false }, canSend: true, readOnlyReason: "" })),
    sendDirect: vi.fn(async () => m("1900000000000-cccccccccccccccc", "student")), getUnread: vi.fn(async () => U), markRead: vi.fn(async () => U)
  });
  it("snapshot [teacher T1, own reply S1 (later)] → acknowledges T1, not S1", async () => {
    const T1 = m("1800000000001-aaaaaaaaaaaaaaaa", "teacher"), S1 = m("1800000000002-bbbbbbbbbbbbbbbb", "student");
    const c = client([T1, S1]);
    render(<StudentMessagesPage token="t" onBack={() => {}} client={c} />);
    await screen.findByText("b-" + S1.messageId);
    await waitFor(() => expect(c.markRead).toHaveBeenCalledWith("direct", { throughMessageId: T1.messageId, seenIdsAtBoundary: [T1.messageId] }));
  });
  it("only own replies shown → nothing is marked", async () => {
    const c = client([m("1800000000002-bbbbbbbbbbbbbbbb", "student")]);
    render(<StudentMessagesPage token="t" onBack={() => {}} client={c} />);
    await screen.findByText("b-1800000000002-bbbbbbbbbbbbbbbb");
    await new Promise(r => setTimeout(r, 20));
    expect(c.markRead).not.toHaveBeenCalled();
  });
});
