import { describe, it, expect } from "vitest";
import { handler as studentMessages } from "../src/functions/student-messages.js";
import { handler as teacherMessages } from "../src/functions/messages.js";
import { directPrefix, announcementPrefix, DIRECT_PREFIX, ANNOUNCEMENT_PREFIX, MAX_BODY_LENGTH } from "../src/lib/message-store.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 5C — STUDENT messaging API. Uses the REAL requireActiveStudentSession (only the stateless token check is
// stubbed), so the persisted student document is the authority for identity, class and revocation.

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const C1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const C2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const C3 = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const student = (userId, over = {}) => ({ schemaVersion: 3, role: "student", userId, displayName: "الطالب " + userId.slice(0, 1), classId: C1, active: true, archived: false, authVersion: 1, identityNumber: "987654321", code: "CODE-" + userId.slice(0, 1), ...over });
const seed = (over = {}) => ({
  ["platform/users/" + S1 + ".json"]: student(S1),
  ["platform/users/" + S2 + ".json"]: student(S2),
  ["platform/classes/" + C1 + ".json"]: { classId: C1, name: "الصف الأول", active: true, studentIds: [S1, S2] },
  ["platform/classes/" + C2 + ".json"]: { classId: C2, name: "الصف الثاني", active: true, studentIds: [] },
  ["platform/classes/" + C3 + ".json"]: { classId: C3, name: "صف مؤرشف", status: "archived", active: false, studentIds: [] },
  ...over
});

// Token claims deliberately carry a STALE name/class: the persisted document must win.
const AS = (ctx, sub, claims = {}) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub, sv: 1, role: "student", name: "TOKEN NAME", classId: C2, ...claims } }) });
const NO_TOKEN = ctx => ({ container: ctx.container, requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) });
const TEACHER = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "builder-1" } }), container: ctx.container, resolveTeacherDisplayName: async () => "أ. أحمد", recordAuditEvent: async () => {} });
const sGet = (deps, q = "") => studentMessages({ method: "GET", url: "https://x/api/student-messages" + q, headers: { get: () => null } }, deps);
const sPost = (deps, body) => studentMessages({ method: "POST", url: "https://x/api/student-messages", headers: { get: () => null }, json: async () => body }, deps);
const tPost = (deps, body) => teacherMessages({ method: "POST", url: "https://x/api/messages", headers: { get: () => null }, json: async () => body }, deps);

describe("auth — the existing hardened session authority", () => {
  it("no/invalid token, missing, inactive, archived, or revoked (authVersion bumped) student → 401; nothing written", async () => {
    const ctx = createMemoryContainer(seed({
      ["platform/users/dddddddd-0000-0000-0000-000000000001.json"]: student("dddddddd-0000-0000-0000-000000000001", { active: false }),
      ["platform/users/dddddddd-0000-0000-0000-000000000002.json"]: student("dddddddd-0000-0000-0000-000000000002", { archived: true }),
      ["platform/users/dddddddd-0000-0000-0000-000000000003.json"]: student("dddddddd-0000-0000-0000-000000000003", { authVersion: 2 })
    }));
    expect((await sGet(NO_TOKEN(ctx))).status).toBe(401);
    for (const sub of ["eeeeeeee-0000-0000-0000-000000000000", "dddddddd-0000-0000-0000-000000000001", "dddddddd-0000-0000-0000-000000000002", "dddddddd-0000-0000-0000-000000000003"]) {
      expect((await sGet(AS(ctx, sub))).status, sub).toBe(401);
      expect((await sPost(AS(ctx, sub), { action: "sendDirect", body: "x" })).status, sub).toBe(401);
    }
    expect(ctx.names("platform/messages/")).toEqual([]);
  });
});

describe("read — own thread + CURRENT class announcements only", () => {
  it("returns only the student's own direct thread and only the current class's announcements; client classId/studentId ignored", async () => {
    const ctx = createMemoryContainer(seed());
    await tPost(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "لـ S1" });
    await tPost(TEACHER(ctx), { action: "sendDirect", studentId: S2, body: "SECRET لـ S2" });
    await tPost(TEACHER(ctx), { action: "sendAnnouncement", classId: C1, body: "إعلان C1" });
    await tPost(TEACHER(ctx), { action: "sendAnnouncement", classId: C2, body: "SECRET إعلان C2" });
    const r = await sGet(AS(ctx, S1), "?studentId=" + S2 + "&classId=" + C2);
    expect(r.status).toBe(200);
    expect(r.jsonBody.direct.map(m => m.body)).toEqual(["لـ S1"]);
    expect(r.jsonBody.announcements.map(m => m.body)).toEqual(["إعلان C1"]);
    expect(r.jsonBody.classroom).toEqual({ classId: C1, name: "الصف الأول", archived: false });
    expect(r.jsonBody.canSend).toBe(true);
    const text = JSON.stringify(r.jsonBody);
    for (const leak of ["SECRET", S2, "987654321", "CODE-", "builder-1", "senderId", "classIdAtSend", "platform/", "studentIds", "authVersion"]) expect(text, leak).not.toContain(leak);
  });
  it("announcements follow the student's CURRENT persisted class (moved A→B), never the token's classId; the direct thread follows the student", async () => {
    const ctx = createMemoryContainer(seed());
    await tPost(TEACHER(ctx), { action: "sendAnnouncement", classId: C1, body: "old class" });
    await tPost(TEACHER(ctx), { action: "sendAnnouncement", classId: C2, body: "new class" });
    await tPost(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "direct stays" });
    ctx.setJson("platform/users/" + S1 + ".json", student(S1, { classId: C2 }));
    const r = await sGet(AS(ctx, S1, { classId: C1 }));
    expect(r.jsonBody.announcements.map(m => m.body)).toEqual(["new class"]);
    expect(r.jsonBody.direct.map(m => m.body)).toEqual(["direct stays"]);
  });
});

describe("send — sendDirect only, server-derived identity", () => {
  it("active current class → reply stored in the student's OWN thread with the persisted name; spoofed fields ignored", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await sPost(AS(ctx, S1), {
      action: "sendDirect", body: " شكرًا أستاذ ",
      studentId: S2, senderId: S2, senderName: "Mallory", senderRole: "teacher", senderDisplayName: "المعلم", classId: C2, recipientStudentId: S2, recipientIds: [S2], messageId: "1-x", createdAt: "1999-01-01"
    });
    expect(r.status).toBe(200);
    expect(r.jsonBody.message).toMatchObject({ kind: "direct", senderRole: "student", senderDisplayName: "الطالب 1", body: "شكرًا أستاذ" });
    expect(Object.keys(r.jsonBody.message)).not.toContain("senderId");
    expect(ctx.names(DIRECT_PREFIX)).toEqual([directPrefix(S1) + r.jsonBody.message.messageId + ".json"]);
    const stored = ctx.getJson(ctx.names(DIRECT_PREFIX)[0]);
    expect(stored).toMatchObject({ studentId: S1, senderId: S1, senderRole: "student", senderDisplayName: "الطالب 1", classIdAtSend: C1 });
    expect(JSON.stringify(stored)).not.toContain("Mallory");
    expect(JSON.stringify(stored)).not.toContain("TOKEN NAME");
  });
  it("NO student-to-student: a body studentId:'other-student' never lands in that student's prefix", async () => {
    const ctx = createMemoryContainer(seed());
    await sPost(AS(ctx, S1), { action: "sendDirect", studentId: S2, body: "hi S2?" });
    await sPost(AS(ctx, S1), { action: "sendDirect", studentId: "other-student", body: "hi?" });
    expect(ctx.names(directPrefix(S2))).toEqual([]);
    expect(ctx.names(DIRECT_PREFIX + "other-student/")).toEqual([]);
    expect(ctx.names(DIRECT_PREFIX).every(n => n.startsWith(directPrefix(S1)))).toBe(true);
  });
  it("no class announcement / group action exists for students", async () => {
    const ctx = createMemoryContainer(seed());
    for (const action of ["sendAnnouncement", "sendToStudent", "sendToClass", "send", ""]) {
      expect((await sPost(AS(ctx, S1), { action, classId: C1, studentId: S2, body: "x" })).status, action).toBe(400);
    }
    expect(ctx.names(ANNOUNCEMENT_PREFIX)).toEqual([]);
    expect(ctx.names("platform/messages/")).toEqual([]);
  });
  it("archived current class → reply rejected (403, read-only) while its history stays readable", async () => {
    const ctx = createMemoryContainer(seed());
    await tPost(TEACHER(ctx), { action: "sendAnnouncement", classId: C1, body: "قبل الأرشفة" });
    await tPost(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "رسالة قديمة" });
    ctx.setJson("platform/classes/" + C1 + ".json", { classId: C1, name: "الصف الأول", status: "archived", active: false });
    const r = await sPost(AS(ctx, S1), { action: "sendDirect", body: "رد" });
    expect(r.status).toBe(403); expect(r.jsonBody.code).toBe("classArchived");
    const g = await sGet(AS(ctx, S1));
    expect(g.status).toBe(200);
    expect(g.jsonBody.canSend).toBe(false);
    expect(g.jsonBody.classroom.archived).toBe(true);
    expect(g.jsonBody.direct.map(m => m.body)).toEqual(["رسالة قديمة"]);
    expect(g.jsonBody.announcements.map(m => m.body)).toEqual(["قبل الأرشفة"]);
    expect(ctx.names(directPrefix(S1)).length).toBe(1);
  });
  it("empty / oversized / non-string body → 400", async () => {
    const ctx = createMemoryContainer(seed());
    for (const body of ["", "  \n ", 7, null, "x".repeat(MAX_BODY_LENGTH + 1)]) expect((await sPost(AS(ctx, S1), { action: "sendDirect", body })).status).toBe(400);
    expect(ctx.names("platform/messages/")).toEqual([]);
  });
  it("teacher and student threads interleave chronologically in the one conversation", async () => {
    const ctx = createMemoryContainer(seed());
    await tPost(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "T1" });
    await new Promise(r => setTimeout(r, 3));
    await sPost(AS(ctx, S1), { action: "sendDirect", body: "S1" });
    await new Promise(r => setTimeout(r, 3));
    await tPost(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "T2" });
    const r = await sGet(AS(ctx, S1));
    expect(r.jsonBody.direct.map(m => m.senderRole + ":" + m.body)).toEqual(["teacher:T1", "student:S1", "teacher:T2"]);
    expect(announcementPrefix(C1)).toContain(C1);
  });
});
