import { describe, it, expect, beforeEach } from "vitest";
import { handler as today } from "../src/functions/teacher-today.js";
import { handler as teacherMessages } from "../src/functions/messages.js";
import { directPrefix, sequencedMessageId } from "../src/lib/message-store.js";
import { createUnreadMemo } from "../src/lib/message-unread-memo.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Hotfix (found while designing P5-B3) — FAIL-FIRST. The «اليوم» hub's unread-messages badge called teacherDirectUnread WITHOUT the
// tenancy predicate the messages route passes (`canSee`, Phase 21G.0): a teacher's badge counted the unread direct messages of EVERY
// teacher's students on the platform (a count only — no content — but another tenant's activity, and a wrong number). Now it counts
// only the teacher's own students, exactly like GET /api/messages?unread. TEST data only.

const A = "teacher-a", B = "teacher-b";
const user = (userId, classId) => ({ schemaVersion: 3, role: "student", userId, displayName: "طالب", classId, active: true, archived: false, authVersion: 1, identityNumber: "1" });
const sA = "11111111-1111-1111-1111-111111111111", sB1 = "22222222-2222-2222-2222-222222222221", sB2 = "22222222-2222-2222-2222-222222222222";
let clock, ctx;
const put = (s, p) => { const prefix = directPrefix(s); const id = sequencedMessageId(prefix, p); ctx.setJson(prefix + id + ".json", { schemaVersion: 1, messageId: id, createdAt: new Date(clock + p).toISOString(), kind: "direct", studentId: s, senderRole: "student", senderId: s, senderDisplayName: "طالب", body: "رسالة " + p }); };
const deps = sub => ({ requireBuilderAuth: () => ({ ok: true, user: { sub, am: "multi-user" } }), container: ctx.container, getContainer: () => ctx.container, nowMs: clock, unreadMemo: createUnreadMemo(), now: () => clock, resolveTeacherDisplayName: async () => "أ.", recordAuditEvent: async () => {}, notifyStudentOfNewMessage: async () => {} });
const badge = async sub => (await today({ method: "GET", url: "http://x/api/teacher-today", headers: { get: () => null } }, deps(sub))).jsonBody.attention.unreadMessages;
const route = async sub => (await teacherMessages({ method: "GET", url: "https://x/api/messages?kind=unread-summary", headers: { get: () => null } }, deps(sub))).jsonBody;

beforeEach(() => {
  clock = Date.parse("2026-11-03T08:00:00.000Z");
  ctx = createMemoryContainer({
    "platform/classes/cA.json": { classId: "cA", name: "صف أ", active: true, status: "active", ownerId: A },
    "platform/classes/cB.json": { classId: "cB", name: "صف ب", active: true, status: "active", ownerId: B },
    ["platform/users/" + sA + ".json"]: user(sA, "cA"),
    ["platform/users/" + sB1 + ".json"]: user(sB1, "cB"),
    ["platform/users/" + sB2 + ".json"]: user(sB2, "cB")
  });
  put(sA, 1); put(sB1, 2); put(sB2, 3); put(sB2, 4);
});

describe("hotfix fail-first — the «اليوم» unread badge counts only the teacher's own students", () => {
  it("teacher A: 1 unread (her student), never the 3 of teacher B's students", async () => {
    expect((await badge(A)).total).toBe(1);
    expect((await badge(B)).total).toBe(3);
  });
  it("the badge equals the messages route's own unread total for the same teacher", async () => {
    for (const t of [A, B]) expect((await badge(t)).total).toBe(Number((await route(t)).totalUnread));
  });
});
