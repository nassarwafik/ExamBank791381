import { describe, it, expect, beforeEach } from "vitest";
import { handler as teacher } from "../src/functions/messages.js";
import { handler as studentApi } from "../src/functions/student-messages.js";
import { directPrefix, announcementPrefix } from "../src/lib/message-store.js";
import { READ_STATE_PREFIX, teacherDirectStateName, studentDirectStateName, studentAnnouncementStateName } from "../src/lib/message-read-state.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 5D — unread summaries + mark-read through the REAL handlers (teacher builder auth / hardened student session).

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const S3 = "33333333-3333-3333-3333-333333333333";
const CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CX = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const user = (userId, over = {}) => ({ schemaVersion: 3, role: "student", userId, displayName: "طالب " + userId[0], classId: CA, active: true, archived: false, authVersion: 1, identityNumber: "123456789", ...over });
const seed = () => ({
  ["platform/users/" + S1 + ".json"]: user(S1),
  ["platform/users/" + S2 + ".json"]: user(S2),
  ["platform/users/" + S3 + ".json"]: user(S3, { active: false, archived: true }),
  ["platform/classes/" + CA + ".json"]: { classId: CA, name: "أ", active: true, studentIds: [] },
  ["platform/classes/" + CB + ".json"]: { classId: CB, name: "ب", active: true, studentIds: [] },
  ["platform/classes/" + CX + ".json"]: { classId: CX, name: "مؤرشف", status: "archived", active: false, studentIds: [] }
});
let audits;
const T = (ctx, sub = "builder-1") => ({ requireBuilderAuth: () => ({ ok: true, user: { sub } }), container: ctx.container, resolveTeacherDisplayName: async () => "أ. أحمد", recordAuditEvent: async (_c, e) => { audits.push(e); } });
const ANON = ctx => ({ requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }), container: ctx.container });
const ST = (ctx, sub) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub, sv: 1, role: "student", classId: CB } }) });
const tGet = (deps, q) => teacher({ method: "GET", url: "https://x/api/messages" + q, headers: { get: () => null } }, deps);
const tPost = (deps, body) => teacher({ method: "POST", url: "https://x/api/messages", headers: { get: () => null }, json: async () => body }, deps);
const sGet = (deps, q = "") => studentApi({ method: "GET", url: "https://x/api/student-messages" + q, headers: { get: () => null } }, deps);
const sPost = (deps, body) => studentApi({ method: "POST", url: "https://x/api/student-messages", headers: { get: () => null }, json: async () => body }, deps);
const mid = (ms, hex) => String(ms) + "-" + hex.repeat(16).slice(0, 16);
const putDirect = (ctx, sid, messageId, senderRole) => ctx.setJson(directPrefix(sid) + messageId + ".json", { schemaVersion: 1, messageId, kind: "direct", studentId: sid, senderRole, senderId: "x", senderDisplayName: "x", body: "b", createdAt: "", classIdAtSend: CA });
const putAnn = (ctx, cid, messageId) => ctx.setJson(announcementPrefix(cid) + messageId + ".json", { schemaVersion: 1, messageId, kind: "announcement", classId: cid, senderRole: "teacher", senderId: "t", senderDisplayName: "x", body: "a", createdAt: "" });
const snapshot = (ctx, prefix) => JSON.stringify(ctx.names(prefix).map(n => [n, ctx.store.get(n).etag, ctx.store.get(n).content.toString("utf8")]));

beforeEach(() => { audits = []; });

describe("teacher unread summary", () => {
  it("auth required; counts ONLY student replies (own teacher messages never unread)", async () => {
    const ctx = createMemoryContainer(seed());
    expect((await tGet(ANON(ctx), "?kind=unread-summary")).status).toBe(401);
    expect((await tPost(ANON(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: mid(1, "a"), seenIdsAtBoundary: [mid(1, "a")] })).status).toBe(401);
    await tPost(T(ctx), { action: "sendDirect", studentId: S1, body: "من المعلم" });
    await sPost(ST(ctx, S1), { action: "sendDirect", body: "رد 1" });
    await sPost(ST(ctx, S1), { action: "sendDirect", body: "رد 2" });
    await sPost(ST(ctx, S2), { action: "sendDirect", body: "رد S2" });
    const r = await tGet(T(ctx), "?kind=unread-summary");
    expect(r.status).toBe(200);
    expect(r.jsonBody).toEqual({ ok: true, totalUnread: 3, capped: false });
  });

  it("class summary: byStudent from CURRENT student documents; archived student's old reply still appears; unknown class → 404", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, S1, mid(1800000000001, "a"), "student");
    putDirect(ctx, S3, mid(1800000000002, "b"), "student");                   // archived/disabled student
    putDirect(ctx, S2, mid(1800000000003, "c"), "teacher");                   // teacher-only thread → 0
    const r = await tGet(T(ctx), "?kind=unread-summary&classId=" + CA);
    expect(r.jsonBody).toEqual({ ok: true, classId: CA, totalUnread: 2, capped: false, byStudent: { [S1]: { unread: 1, capped: false }, [S3]: { unread: 1, capped: false } } });
    expect((await tGet(T(ctx), "?kind=unread-summary&classId=dddddddd-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await tGet(T(ctx), "?kind=unread-summary&classId=../users")).status).toBe(404);
  });
});

describe("teacher markDirectRead", () => {
  it("validates the student and the message; forged / other-student ids → 400 with ZERO marker change", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, S1, mid(1800000000001, "a"), "student");
    putDirect(ctx, S2, mid(1800000000002, "b"), "student");
    expect((await tPost(T(ctx), { action: "markDirectRead", studentId: "nobody", throughMessageId: mid(1800000000001, "a"), seenIdsAtBoundary: [mid(1800000000001, "a")] })).status).toBe(404);
    for (const through of ["9999999999999-ffffffffffffffff", mid(1800000000002, "b"), "x", undefined]) {
      expect((await tPost(T(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: through, seenIdsAtBoundary: [through] })).status).toBe(400);
    }
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([]);
  });

  it("mark through X leaves a later Y unread; an older mark after a newer one cannot regress; blobs unchanged; not audited", async () => {
    const ctx = createMemoryContainer(seed());
    const X = mid(1800000000001, "a"), Y = mid(1800000000005, "b");
    putDirect(ctx, S1, X, "student");
    putDirect(ctx, S1, Y, "student");                                       // arrived after the teacher's GET snapshot (through X)
    const before = snapshot(ctx, directPrefix(S1));
    const r1 = await tPost(T(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: X, seenIdsAtBoundary: [X] });
    expect(r1.jsonBody).toEqual({ ok: true, studentId: S1, unread: 1, capped: false });
    const r2 = await tPost(T(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: Y, seenIdsAtBoundary: [Y] });
    expect(r2.jsonBody.unread).toBe(0);
    const r3 = await tPost(T(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: X, seenIdsAtBoundary: [X] });   // stale/slow older mark
    expect(r3.jsonBody.unread).toBe(0);
    expect(ctx.getJson(teacherDirectStateName("builder-1", S1)).boundaryMs).toBe(1800000000005);
    expect(snapshot(ctx, directPrefix(S1))).toBe(before);
    expect(audits).toEqual([]);
    expect((await tGet(T(ctx), "?kind=unread-summary")).jsonBody.totalUnread).toBe(0);
  });

  it("an archived student's historical conversation can still be marked read", async () => {
    const ctx = createMemoryContainer(seed());
    const X = mid(1800000000001, "a");
    putDirect(ctx, S3, X, "student");
    expect((await tPost(T(ctx), { action: "markDirectRead", studentId: S3, throughMessageId: X, seenIdsAtBoundary: [X] })).jsonBody.unread).toBe(0);
  });
});

describe("student unread summary", () => {
  it("own direct thread (teacher messages only) + CURRENT class announcements only; query ids ignored; no leaks", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, S1, mid(1800000000001, "a"), "teacher");
    putDirect(ctx, S1, mid(1800000000002, "b"), "student");                   // own reply → not unread
    putDirect(ctx, S2, mid(1800000000003, "c"), "teacher");                   // another student's thread
    putAnn(ctx, CA, mid(1800000000004, "d")); putAnn(ctx, CA, mid(1800000000005, "e"));
    putAnn(ctx, CB, mid(1800000000006, "f"));
    const r = await sGet(ST(ctx, S1), "?view=unread&classId=" + CB + "&studentId=" + S2);
    expect(r.jsonBody).toEqual({ ok: true, directUnread: { unread: 1, capped: false }, announcementUnread: { unread: 2, capped: false }, totalUnread: 3, totalCapped: false });
    const text = JSON.stringify(r.jsonBody);
    for (const leak of [S2, CB, "platform/", "123456789"]) expect(text).not.toContain(leak);
  });

  it("moved A→B: the summary uses B; old class A announcements cannot be marked", async () => {
    const ctx = createMemoryContainer(seed());
    const oldAnn = mid(1800000000001, "a"), newAnn = mid(1800000000002, "b");
    putAnn(ctx, CA, oldAnn); putAnn(ctx, CB, newAnn);
    ctx.setJson("platform/users/" + S1 + ".json", user(S1, { classId: CB }));
    expect((await sGet(ST(ctx, S1), "?view=unread")).jsonBody.announcementUnread.unread).toBe(1);
    expect((await sPost(ST(ctx, S1), { action: "markRead", stream: "announcements", throughMessageId: oldAnn, seenIdsAtBoundary: [oldAnn], classId: CA })).status).toBe(400);
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([]);
    const ok = await sPost(ST(ctx, S1), { action: "markRead", stream: "announcements", throughMessageId: newAnn, seenIdsAtBoundary: [newAnn], classId: CA });
    expect(ok.jsonBody).toMatchObject({ ok: true, stream: "announcements", unread: 0, announcementUnread: { unread: 0, capped: false } });
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([studentAnnouncementStateName(S1, CB)]);
  });
});

describe("student markRead", () => {
  it("direct: only the authenticated own stream; forged / another student's id → 400; body studentId ignored", async () => {
    const ctx = createMemoryContainer(seed());
    const own = mid(1800000000001, "a"), other = mid(1800000000002, "b");
    putDirect(ctx, S1, own, "teacher"); putDirect(ctx, S2, other, "teacher");
    for (const through of [other, "9999999999999-ffffffffffffffff", ""]) {
      expect((await sPost(ST(ctx, S1), { action: "markRead", stream: "direct", throughMessageId: through, seenIdsAtBoundary: [through], studentId: S2 })).status).toBe(400);
    }
    expect((await sPost(ST(ctx, S1), { action: "markRead", stream: "nope", throughMessageId: own, seenIdsAtBoundary: [own] })).status).toBe(400);
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([]);
    const r = await sPost(ST(ctx, S1), { action: "markRead", stream: "direct", throughMessageId: own, seenIdsAtBoundary: [own], studentId: S2 });
    expect(r.jsonBody).toMatchObject({ ok: true, stream: "direct", unread: 0, directUnread: { unread: 0, capped: false } });
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([studentDirectStateName(S1)]);
  });

  it("direct mark does not touch announcements: direct 3 + announcements 2 → after marking direct, total 2", async () => {
    const ctx = createMemoryContainer(seed());
    for (let i = 1; i <= 3; i++) putDirect(ctx, S1, mid(1800000000000 + i, "a"), "teacher");
    putAnn(ctx, CA, mid(1800000000010, "b")); putAnn(ctx, CA, mid(1800000000011, "c"));
    const r = await sPost(ST(ctx, S1), { action: "markRead", stream: "direct", throughMessageId: mid(1800000000003, "a"), seenIdsAtBoundary: [mid(1800000000003, "a")] });
    expect(r.jsonBody).toMatchObject({ directUnread: { unread: 0 }, announcementUnread: { unread: 2 }, totalUnread: 2 });
  });

  it("RACE: mark through X while a newer teacher message Y exists → Y remains unread; an older mark cannot regress", async () => {
    const ctx = createMemoryContainer(seed());
    const X = mid(1800000000001, "a"), Y = mid(1800000000002, "b");
    putDirect(ctx, S1, X, "teacher"); putDirect(ctx, S1, Y, "teacher");
    expect((await sPost(ST(ctx, S1), { action: "markRead", stream: "direct", throughMessageId: X, seenIdsAtBoundary: [X] })).jsonBody.unread).toBe(1);
    await sPost(ST(ctx, S1), { action: "markRead", stream: "direct", throughMessageId: Y, seenIdsAtBoundary: [Y] });
    expect((await sPost(ST(ctx, S1), { action: "markRead", stream: "direct", throughMessageId: X, seenIdsAtBoundary: [X] })).jsonBody.unread).toBe(0);
    expect(ctx.getJson(studentDirectStateName(S1)).boundaryMs).toBe(1800000000002);
  });

  it("SAME-MS at the API: a later same-millisecond teacher message with a lower suffix stays unread", async () => {
    const ctx = createMemoryContainer(seed());
    const t = 1800000000777, A = mid(t, "8"), C = mid(t, "2");
    putDirect(ctx, S1, A, "teacher");
    await sPost(ST(ctx, S1), { action: "markRead", stream: "direct", throughMessageId: A, seenIdsAtBoundary: [A] });
    putDirect(ctx, S1, C, "teacher");
    expect((await sGet(ST(ctx, S1), "?view=unread")).jsonBody.directUnread.unread).toBe(1);
  });

  it("archived current class: history countable and markable, but a new reply is still refused", async () => {
    const ctx = createMemoryContainer(seed());
    ctx.setJson("platform/users/" + S1 + ".json", user(S1, { classId: CX }));
    const ann = mid(1800000000001, "a"), dm = mid(1800000000002, "b");
    putAnn(ctx, CX, ann); putDirect(ctx, S1, dm, "teacher");
    expect((await sGet(ST(ctx, S1), "?view=unread")).jsonBody.totalUnread).toBe(2);
    expect((await sPost(ST(ctx, S1), { action: "markRead", stream: "announcements", throughMessageId: ann, seenIdsAtBoundary: [ann] })).jsonBody.announcementUnread.unread).toBe(0);
    expect((await sPost(ST(ctx, S1), { action: "markRead", stream: "direct", throughMessageId: dm, seenIdsAtBoundary: [dm] })).jsonBody.totalUnread).toBe(0);
    expect((await sPost(ST(ctx, S1), { action: "sendDirect", body: "رد" })).status).toBe(403);
  });
});

describe("snapshot acknowledgement at the API (review follow-up)", () => {
  it("EXACT RESIDUAL through the teacher API: GET snapshot [A] → same-ms C inserted → POST {A, [A]} → response unread === 1", async () => {
    const ctx = createMemoryContainer(seed());
    const A = "1800000000777-8888888888888888", C = "1800000000777-2222222222222222";
    putDirect(ctx, S1, A, "student");
    const get = await tGet(T(ctx), "?studentId=" + S1);
    const shown = get.jsonBody.messages.map(m => m.messageId);                    // the viewed snapshot
    expect(shown).toEqual([A]);
    putDirect(ctx, S1, C, "student");                                            // after the GET, before the POST
    const r = await tPost(T(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: A, seenIdsAtBoundary: shown });
    expect(r.jsonBody).toEqual({ ok: true, studentId: S1, unread: 1, capped: false });
    expect((await tGet(T(ctx), "?kind=unread-summary")).jsonBody.totalUnread).toBe(1);
  });

  it("the boundary list is REQUIRED; a missing / forged list → 400 and no marker", async () => {
    const ctx = createMemoryContainer(seed());
    const A = "1800000000777-8888888888888888";
    putDirect(ctx, S1, A, "student");
    putDirect(ctx, S2, "1800000000777-1111111111111111", "student");
    expect((await tPost(T(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: A })).status).toBe(400);
    expect((await tPost(T(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: A, seenIdsAtBoundary: [A, "1800000000777-1111111111111111"] })).status).toBe(400);
    expect((await sPost(ST(ctx, S1), { action: "markRead", stream: "direct", throughMessageId: A })).status).toBe(400);
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([]);
  });

  it("TEACHER role boundary: snapshot S1(student) then T1(teacher) → acknowledge S1 (T1 is rejected); a later S2 stays unread", async () => {
    const ctx = createMemoryContainer(seed());
    const s1 = mid(1800000000001, "a"), t1 = mid(1800000000002, "b"), s2 = mid(1800000000003, "c");
    putDirect(ctx, S1, s1, "student"); putDirect(ctx, S1, t1, "teacher");
    expect((await tPost(T(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: t1, seenIdsAtBoundary: [t1] })).status).toBe(400);
    putDirect(ctx, S1, s2, "student");
    const r = await tPost(T(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: s1, seenIdsAtBoundary: [s1] });
    expect(r.jsonBody.unread).toBe(1);
  });

  it("STUDENT role boundary: snapshot T1(teacher) then own reply S1 → acknowledge T1 (S1 is rejected); a later unseen teacher message stays unread", async () => {
    const ctx = createMemoryContainer(seed());
    const t1 = mid(1800000000001, "a"), own = mid(1800000000002, "b"), t2 = mid(1800000000003, "c");
    putDirect(ctx, S1, t1, "teacher"); putDirect(ctx, S1, own, "student");
    expect((await sPost(ST(ctx, S1), { action: "markRead", stream: "direct", throughMessageId: own, seenIdsAtBoundary: [own] })).status).toBe(400);
    putDirect(ctx, S1, t2, "teacher");
    const r = await sPost(ST(ctx, S1), { action: "markRead", stream: "direct", throughMessageId: t1, seenIdsAtBoundary: [t1] });
    expect(r.jsonBody).toMatchObject({ unread: 1, directUnread: { unread: 1 } });
  });

  it("ANNOUNCEMENTS: the latest visible announcement is the boundary; a direct id cannot be used", async () => {
    const ctx = createMemoryContainer(seed());
    const a1 = mid(1800000000001, "a"), a2 = mid(1800000000002, "b"), dm = mid(1800000000002, "c");
    putAnn(ctx, CA, a1); putAnn(ctx, CA, a2); putDirect(ctx, S1, dm, "teacher");
    expect((await sPost(ST(ctx, S1), { action: "markRead", stream: "announcements", throughMessageId: dm, seenIdsAtBoundary: [dm] })).status).toBe(400);
    expect((await sPost(ST(ctx, S1), { action: "markRead", stream: "announcements", throughMessageId: a2, seenIdsAtBoundary: [a2] })).jsonBody.announcementUnread.unread).toBe(0);
  });
});
