// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, within, waitFor, act } from "@testing-library/react";
import TeacherMessagesPage from "./TeacherMessagesPage";
import StudentMessagesPage from "./StudentMessagesPage";
import {
  readAckFromSnapshot, ackKey, createTeacherMessagesClient, createStudentMessagesClient,
  type MessageView, type TeacherMessagesClient, type StudentMessagesClient, type ThreadState
} from "./messagesClient";
import type { Classroom, Student } from "../students/types";

// Phase 5D review follow-up (MEDIUM) — late legacy messages. Legacy (Phase 5C "<ms>-<random>") and sequenced ids are
// separate read domains on the server, so the snapshot acknowledgement carries a LEGACY part for the displayed legacy
// ids, and a late legacy message that appears under an unchanged sequenced X must produce a NEW acknowledgement.

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const m = (id: string, senderRole: "teacher" | "student", kind: "direct" | "announcement" = "direct"): MessageView => ({ messageId: id, kind, senderRole, senderDisplayName: "x", body: "b-" + id, createdAt: "" });
const L1 = "1800000000001-1111111111111111", L2a = "1800000000002-2222222222222222", L2b = "1800000000002-8888888888888888", L3 = "1800000000009-9999999999999999";
const S1 = "9000000000001-aaaaaaaaaaaaaaaa", S2 = "9000000000002-bbbbbbbbbbbbbbbb";

describe("readAckFromSnapshot — legacy part", () => {
  const student = (x: MessageView) => x.senderRole === "student";
  it("sequenced X + displayed legacy ids → legacy part = latest relevant legacy id + its same-ms ids", () => {
    const snap = [m(L1, "student"), m(L2a, "student"), m(L2b, "student"), m(L3, "teacher"), m(S1, "student"), m(S2, "teacher")];
    expect(readAckFromSnapshot(snap, student)).toEqual({ throughMessageId: S1, seenIdsAtBoundary: [S1], legacyThroughMessageId: L2b, legacySeenIdsAtBoundary: [L2a, L2b] });
  });
  it("legacy-only and sequenced-only snapshots carry no legacy part (unchanged request shape)", () => {
    expect(readAckFromSnapshot([m(L1, "student"), m(L2a, "student")], student)).toStrictEqual({ throughMessageId: L2a, seenIdsAtBoundary: [L2a] });
    expect(readAckFromSnapshot([m(S1, "student"), m(S2, "student")], student)).toStrictEqual({ throughMessageId: S2, seenIdsAtBoundary: [S2] });
    expect(readAckFromSnapshot([m(L1, "teacher"), m(S1, "student")], student)).toStrictEqual({ throughMessageId: S1, seenIdsAtBoundary: [S1] });
  });
  it("ackKey changes when ONLY the legacy part changes (a late legacy message under the same sequenced X)", () => {
    const a = readAckFromSnapshot([m(S1, "student")], student)!;
    const b = readAckFromSnapshot([m(L3, "student"), m(S1, "student")], student)!;
    expect(a.throughMessageId).toBe(b.throughMessageId);
    expect(ackKey(a)).not.toBe(ackKey(b));
  });
});

describe("HTTP clients send the legacy part only when present", () => {
  const res = (body: unknown) => Promise.resolve({ status: 200, ok: true, json: async () => body } as Response);
  it("teacher markDirectRead + student markRead", async () => {
    const bodies: unknown[] = [];
    globalThis.fetch = vi.fn((_u: RequestInfo | URL, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return res({ ok: true, unread: 0, capped: false }); }) as unknown as typeof fetch;
    await createTeacherMessagesClient("t").markDirectRead("s1", { throughMessageId: S1, seenIdsAtBoundary: [S1], legacyThroughMessageId: L1, legacySeenIdsAtBoundary: [L1] });
    await createTeacherMessagesClient("t").markDirectRead("s1", { throughMessageId: S1, seenIdsAtBoundary: [S1] });
    await createStudentMessagesClient("t").markRead("announcements", { throughMessageId: S2, seenIdsAtBoundary: [S2], legacyThroughMessageId: L3, legacySeenIdsAtBoundary: [L3] });
    expect(bodies).toEqual([
      { action: "markDirectRead", studentId: "s1", throughMessageId: S1, seenIdsAtBoundary: [S1], legacyThroughMessageId: L1, legacySeenIdsAtBoundary: [L1] },
      { action: "markDirectRead", studentId: "s1", throughMessageId: S1, seenIdsAtBoundary: [S1] },
      { action: "markRead", stream: "announcements", throughMessageId: S2, seenIdsAtBoundary: [S2], legacyThroughMessageId: L3, legacySeenIdsAtBoundary: [L3] }
    ]);
  });
});

const cls: Classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026", active: true, studentCount: 1, createdAt: "" };
const stu: Student = { userId: "s1", displayName: "سارة", code: "", identityNumber: "", firstName: "", familyName: "", classId: "c1", active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0 };
const thread = (messages: MessageView[]): ThreadState => ({ messages, canSend: true, readOnlyReason: "" });

describe("a late legacy message under an unchanged sequenced X is acknowledged on the next poll", () => {
  it("TEACHER: poll 1 [S1] → mark S1; poll 2 [L-late, S1] → a second mark with the legacy part", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const snapshots = [thread([m(S1, "student")]), thread([m(L3, "student"), m(S1, "student")])];
    const client: TeacherMessagesClient = {
      listClasses: vi.fn(async () => [cls]), listStudents: vi.fn(async () => [stu]),
      getDirect: vi.fn(async () => (snapshots.length > 1 ? snapshots.shift()! : snapshots[0])), getAnnouncements: vi.fn(async () => thread([])),
      sendDirect: vi.fn(async () => m(S2, "teacher")), sendAnnouncement: vi.fn(async () => m(S2, "teacher", "announcement")),
      getClassUnread: vi.fn(async () => ({ totalUnread: 0, capped: false, byStudent: {} })), markDirectRead: vi.fn(async () => ({ unread: 0, capped: false }))
    };
    render(<TeacherMessagesPage token="t" client={client} />);
    fireEvent.change(await screen.findByRole("combobox", { name: "الصف" }), { target: { value: "c1" } });
    fireEvent.click(within(await screen.findByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /سارة/ }));
    await waitFor(() => expect(client.markDirectRead).toHaveBeenCalledWith("s1", { throughMessageId: S1, seenIdsAtBoundary: [S1] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await waitFor(() => expect(client.markDirectRead).toHaveBeenLastCalledWith("s1", { throughMessageId: S1, seenIdsAtBoundary: [S1], legacyThroughMessageId: L3, legacySeenIdsAtBoundary: [L3] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });          // same snapshot again → deduplicated
    expect(client.markDirectRead).toHaveBeenCalledTimes(2);
  });

  it("STUDENT direct: poll 1 [T-S1] → mark; poll 2 [T-L-late, T-S1] → a second mark with the legacy part", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const U = { directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false };
    const loads = [[m(S1, "teacher")], [m(L3, "teacher"), m(S1, "teacher")]];
    const client: StudentMessagesClient = {
      load: vi.fn(async () => ({ direct: loads.length > 1 ? loads.shift()! : loads[0], announcements: [], classroom: { classId: "c1", name: "الصف", archived: false }, canSend: true, readOnlyReason: "" })),
      sendDirect: vi.fn(async () => m(S2, "student")), getUnread: vi.fn(async () => U), markRead: vi.fn(async () => U)
    };
    render(<StudentMessagesPage token="t" onBack={() => {}} client={client} />);
    await waitFor(() => expect(client.markRead).toHaveBeenCalledWith("direct", { throughMessageId: S1, seenIdsAtBoundary: [S1] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await waitFor(() => expect(client.markRead).toHaveBeenLastCalledWith("direct", { throughMessageId: S1, seenIdsAtBoundary: [S1], legacyThroughMessageId: L3, legacySeenIdsAtBoundary: [L3] }));
  });
});
