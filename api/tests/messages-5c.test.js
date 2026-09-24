import { describe, it, expect, beforeEach } from "vitest";
import { handler } from "../src/functions/messages.js";
import { directPrefix, announcementPrefix, DIRECT_PREFIX, ANNOUNCEMENT_PREFIX, MAX_BODY_LENGTH } from "../src/lib/message-store.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 5C — TEACHER messaging API: builder auth, server-derived identity, active-student / active-class send rules,
// readable archived history, create-only immutable messages, audit without message bodies.

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const C1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const C2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const student = (userId, over = {}) => ({ schemaVersion: 3, role: "student", userId, displayName: "طالب " + userId.slice(0, 4), firstName: "ط", familyName: "ب", classId: C1, active: true, archived: false, identityNumber: "123456789", ...over });
const classroom = (classId, over = {}) => ({ schemaVersion: 1, classId, name: "صف " + classId.slice(0, 4), active: true, studentIds: [S1], ...over });
const seed = (over = {}) => ({
  ["platform/users/" + S1 + ".json"]: student(S1),
  ["platform/users/" + S2 + ".json"]: student(S2),
  ["platform/classes/" + C1 + ".json"]: classroom(C1),
  ["platform/classes/" + C2 + ".json"]: classroom(C2, { status: "archived", active: false }),
  ...over
});

let audits;
const TEACHER = (ctx, sub = "builder-1") => ({
  requireBuilderAuth: () => ({ ok: true, user: { sub } }),
  container: ctx.container,
  resolveTeacherDisplayName: async (_c, s) => "أ. " + s,
  recordAuditEvent: async (_c, e) => { audits.push(e); }
});
const ANON = ctx => ({ requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }), container: ctx.container });
const post = (deps, body) => handler({ method: "POST", url: "https://x/api/messages", headers: { get: () => null }, json: async () => body }, deps);
const get = (deps, q) => handler({ method: "GET", url: "https://x/api/messages" + q, headers: { get: () => null } }, deps);

beforeEach(() => { audits = []; });

describe("auth", () => {
  it("no teacher auth → 401 on every surface, nothing written", async () => {
    const ctx = createMemoryContainer(seed());
    expect((await get(ANON(ctx), "?studentId=" + S1)).status).toBe(401);
    expect((await get(ANON(ctx), "?classId=" + C1 + "&kind=announcements")).status).toBe(401);
    expect((await post(ANON(ctx), { action: "sendDirect", studentId: S1, body: "x" })).status).toBe(401);
    expect((await post(ANON(ctx), { action: "sendAnnouncement", classId: C1, body: "x" })).status).toBe(401);
    expect(ctx.names("platform/messages/")).toEqual([]);
  });
});

describe("sendDirect", () => {
  it("active student in an active class → success with server-derived identity; spoofed fields ignored; classIdAtSend from the student document", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await post(TEACHER(ctx), {
      action: "sendDirect", studentId: S1, body: "  مرحبا يا بطل  ",
      teacherId: "evil", senderId: "evil", senderName: "Hacker", senderRole: "student", messageId: "1-x", createdAt: "1999-01-01T00:00:00Z", classId: C2
    });
    expect(r.status).toBe(200);
    expect(r.jsonBody.message).toMatchObject({ kind: "direct", senderRole: "teacher", senderDisplayName: "أ. builder-1", body: "مرحبا يا بطل", studentId: S1 });
    expect(r.jsonBody.message.messageId).toMatch(/^\d{13}-[a-f0-9]{16}$/);
    expect(r.jsonBody.message.createdAt).not.toBe("1999-01-01T00:00:00Z");
    const names = ctx.names(DIRECT_PREFIX);
    expect(names).toEqual([directPrefix(S1) + r.jsonBody.message.messageId + ".json"]);
    const stored = ctx.getJson(names[0]);
    expect(stored).toMatchObject({ senderId: "builder-1", senderRole: "teacher", classIdAtSend: C1, studentId: S1 });
    expect(JSON.stringify(stored)).not.toContain("evil");
    expect(JSON.stringify(stored)).not.toContain("Hacker");
  });
  it("empty / oversized / non-string body → 400; nothing written", async () => {
    const ctx = createMemoryContainer(seed());
    for (const body of ["", "   ", null, 42, "x".repeat(MAX_BODY_LENGTH + 1)]) {
      expect((await post(TEACHER(ctx), { action: "sendDirect", studentId: S1, body })).status, String(body).slice(0, 10)).toBe(400);
    }
    expect(ctx.names("platform/messages/")).toEqual([]);
  });
  it("unknown / unsafe / non-student target → 404; archived or inactive student → 403; student's CURRENT class archived → 403", async () => {
    const ctx = createMemoryContainer(seed({
      ["platform/users/cccccccc-0000-0000-0000-000000000001.json"]: student("cccccccc-0000-0000-0000-000000000001", { archived: true }),
      ["platform/users/cccccccc-0000-0000-0000-000000000002.json"]: student("cccccccc-0000-0000-0000-000000000002", { active: false }),
      ["platform/users/cccccccc-0000-0000-0000-000000000003.json"]: student("cccccccc-0000-0000-0000-000000000003", { classId: C2 }),
      ["platform/users/cccccccc-0000-0000-0000-000000000004.json"]: { role: "teacher", userId: "cccccccc-0000-0000-0000-000000000004" }
    }));
    expect((await post(TEACHER(ctx), { action: "sendDirect", studentId: "dddddddd-0000-0000-0000-000000000000", body: "x" })).status).toBe(404);
    expect((await post(TEACHER(ctx), { action: "sendDirect", studentId: "../classes/" + C1, body: "x" })).status).toBe(404);
    expect((await post(TEACHER(ctx), { action: "sendDirect", studentId: "cccccccc-0000-0000-0000-000000000004", body: "x" })).status).toBe(404);
    const archived = await post(TEACHER(ctx), { action: "sendDirect", studentId: "cccccccc-0000-0000-0000-000000000001", body: "x" });
    expect(archived.status).toBe(403); expect(archived.jsonBody.code).toBe("studentArchived");
    const inactive = await post(TEACHER(ctx), { action: "sendDirect", studentId: "cccccccc-0000-0000-0000-000000000002", body: "x" });
    expect(inactive.status).toBe(403); expect(inactive.jsonBody.code).toBe("studentInactive");
    // The browser cannot override the class: even with classId=C1 in the body, the student's CURRENT class (C2) rules.
    const archivedClass = await post(TEACHER(ctx), { action: "sendDirect", studentId: "cccccccc-0000-0000-0000-000000000003", classId: C1, body: "x" });
    expect(archivedClass.status).toBe(403); expect(archivedClass.jsonBody.code).toBe("classArchived");
    expect(ctx.names("platform/messages/")).toEqual([]);
  });
  it("messages are immutable: each send is a new blob and earlier blobs never change", async () => {
    const ctx = createMemoryContainer(seed());
    const a = await post(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "first" });
    const firstName = directPrefix(S1) + a.jsonBody.message.messageId + ".json";
    const before = JSON.stringify(ctx.getJson(firstName));
    await post(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "second" });
    expect(ctx.names(directPrefix(S1)).length).toBe(2);
    expect(JSON.stringify(ctx.getJson(firstName))).toBe(before);
  });
});

describe("direct read", () => {
  it("chronological history of THAT student only, with canSend; unknown/unsafe ids → 404 (no prefix injection)", async () => {
    const ctx = createMemoryContainer(seed());
    for (const t of ["one", "two", "three"]) await post(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: t });
    await post(TEACHER(ctx), { action: "sendDirect", studentId: S2, body: "other student" });
    const r = await get(TEACHER(ctx), "?studentId=" + S1);
    expect(r.status).toBe(200);
    expect(r.jsonBody.messages.map(m => m.body)).toEqual(["one", "two", "three"]);
    expect(r.jsonBody.canSend).toBe(true);
    expect(r.jsonBody.student).toMatchObject({ userId: S1, active: true, archived: false });
    expect(JSON.stringify(r.jsonBody)).not.toContain("123456789");                 // no identity number
    expect(JSON.stringify(r.jsonBody)).not.toContain("platform/");
    for (const q of ["?studentId=../users", "?studentId=" + encodeURIComponent(S1 + "/.."), "?studentId=nobody"]) expect((await get(TEACHER(ctx), q)).status).toBe(404);
    expect((await get(TEACHER(ctx), "")).status).toBe(400);
  });
  it("an archived or inactive student's OLD history stays readable (read-only)", async () => {
    const ctx = createMemoryContainer(seed());
    await post(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "before archive" });
    ctx.setJson("platform/users/" + S1 + ".json", student(S1, { archived: true, active: false }));
    const r = await get(TEACHER(ctx), "?studentId=" + S1);
    expect(r.status).toBe(200);
    expect(r.jsonBody.messages.map(m => m.body)).toEqual(["before archive"]);
    expect(r.jsonBody.canSend).toBe(false);
    expect(r.jsonBody.readOnlyCode).toBe("studentArchived");
  });
  it("limit is hard-capped", async () => {
    const ctx = createMemoryContainer(seed());
    for (let i = 0; i < 3; i++) await post(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "m" + i });
    expect((await get(TEACHER(ctx), "?studentId=" + S1 + "&limit=2")).jsonBody.messages.map(m => m.body)).toEqual(["m1", "m2"]);
    expect((await get(TEACHER(ctx), "?studentId=" + S1 + "&limit=999999")).jsonBody.messages.length).toBe(3);
  });
});

describe("announcements", () => {
  it("active class → send success with server identity; archived class → 403; unknown → 404", async () => {
    const ctx = createMemoryContainer(seed());
    const ok = await post(TEACHER(ctx), { action: "sendAnnouncement", classId: C1, body: "اختبار يوم الأحد", senderName: "x", teacherId: "evil" });
    expect(ok.status).toBe(200);
    expect(ok.jsonBody.message).toMatchObject({ kind: "announcement", classId: C1, senderRole: "teacher", senderDisplayName: "أ. builder-1" });
    expect(ctx.names(ANNOUNCEMENT_PREFIX)).toEqual([announcementPrefix(C1) + ok.jsonBody.message.messageId + ".json"]);
    expect(ctx.getJson(ctx.names(ANNOUNCEMENT_PREFIX)[0]).senderId).toBe("builder-1");
    const archived = await post(TEACHER(ctx), { action: "sendAnnouncement", classId: C2, body: "x" });
    expect(archived.status).toBe(403); expect(archived.jsonBody.code).toBe("classArchived");
    expect((await post(TEACHER(ctx), { action: "sendAnnouncement", classId: "eeeeeeee-0000-0000-0000-000000000000", body: "x" })).status).toBe(404);
    expect((await post(TEACHER(ctx), { action: "sendAnnouncement", classId: "../users", body: "x" })).status).toBe(404);
    expect((await post(TEACHER(ctx), { action: "sendAnnouncement", classId: C1, body: " " })).status).toBe(400);
    expect(ctx.names(announcementPrefix(C2))).toEqual([]);
  });
  it("old announcements of a class archived later remain readable (read-only)", async () => {
    const ctx = createMemoryContainer(seed());
    await post(TEACHER(ctx), { action: "sendAnnouncement", classId: C1, body: "قبل الأرشفة" });
    ctx.setJson("platform/classes/" + C1 + ".json", classroom(C1, { status: "archived", active: false }));
    const r = await get(TEACHER(ctx), "?classId=" + C1 + "&kind=announcements");
    expect(r.status).toBe(200);
    expect(r.jsonBody.messages.map(m => m.body)).toEqual(["قبل الأرشفة"]);
    expect(r.jsonBody.classroom).toMatchObject({ classId: C1, status: "archived" });
    expect(r.jsonBody.canSend).toBe(false);
    expect((await get(TEACHER(ctx), "?classId=nope&kind=announcements")).status).toBe(404);
  });
});

describe("audit", () => {
  it("teacher sends are audited WITHOUT the message body; an audit failure never fails the send", async () => {
    const ctx = createMemoryContainer(seed());
    await post(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "SECRET-BODY-1" });
    await post(TEACHER(ctx), { action: "sendAnnouncement", classId: C1, body: "SECRET-BODY-2" });
    expect(audits.map(a => a.action)).toEqual(["message.sendDirect", "message.sendAnnouncement"]);
    expect(JSON.stringify(audits)).not.toContain("SECRET-BODY");
    const throwing = { ...TEACHER(ctx), recordAuditEvent: async () => { throw new Error("audit down"); } };
    expect((await post(throwing, { action: "sendDirect", studentId: S1, body: "still sent" })).status).toBe(200);
  });
  it("unsupported action → 400", async () => {
    const ctx = createMemoryContainer(seed());
    for (const action of ["deleteMessage", "editMessage", "sendToClass", ""]) expect((await post(TEACHER(ctx), { action, studentId: S1, body: "x" })).status).toBe(400);
  });
});
