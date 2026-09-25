import { describe, it, expect } from "vitest";
import { handler as teacher } from "../src/functions/messages.js";
import { handler as studentApi } from "../src/functions/student-messages.js";
import { directPrefix, announcementPrefix } from "../src/lib/message-store.js";
import { READ_STATE_PREFIX, studentDirectStateName } from "../src/lib/message-read-state.js";
import { NOTIFICATION_LIMIT, PREVIEW_LENGTH, previewOf } from "../src/lib/student-notifications.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 6C — GET /api/student-messages?view=notifications through the REAL handler (hardened student session): a
// read-only projection of the student's OWN direct thread (teacher messages) + the CURRENT class's announcements, with
// the Phase 5D read markers deciding each item's unread flag and the SAME unread summary as ?view=unread.

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const S4 = "44444444-4444-4444-4444-444444444444";
const CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CX = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const user = (userId, over = {}) => ({ schemaVersion: 3, role: "student", userId, displayName: "طالب " + userId[0], classId: CA, active: true, archived: false, authVersion: 1, ...over });
const seed = () => ({
  ["platform/users/" + S1 + ".json"]: user(S1),
  ["platform/users/" + S2 + ".json"]: user(S2, { classId: CB }),
  ["platform/users/" + S4 + ".json"]: user(S4, { classId: CX }),
  ["platform/classes/" + CA + ".json"]: { classId: CA, name: "أ", active: true, studentIds: [] },
  ["platform/classes/" + CB + ".json"]: { classId: CB, name: "ب", active: true, studentIds: [] },
  ["platform/classes/" + CX + ".json"]: { classId: CX, name: "مؤرشف", status: "archived", active: false, studentIds: [] }
});
const T = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "builder-1" } }), container: ctx.container, resolveTeacherDisplayName: async () => "أ. أحمد", recordAuditEvent: async () => {} });
// The token's classId claim is deliberately WRONG (CB): the server must use the persisted student document.
const ST = (ctx, sub) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub, sv: 1, role: "student", classId: CB } }) });
const ANON = ctx => ({ container: ctx.container, requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }) });
const tPost = (deps, body) => teacher({ method: "POST", url: "https://x/api/messages", headers: { get: () => null }, json: async () => body }, deps);
const sGet = (deps, q = "") => studentApi({ method: "GET", url: "https://x/api/student-messages" + q, headers: { get: () => null } }, deps);
const sPost = (deps, body) => studentApi({ method: "POST", url: "https://x/api/student-messages", headers: { get: () => null }, json: async () => body }, deps);
const notifications = (ctx, sid, extra = "") => sGet(ST(ctx, sid), "?view=notifications" + extra);
const mid = (ms, hex) => String(ms) + "-" + hex.repeat(16).slice(0, 16);
const at = s => new Date(Date.UTC(2026, 8, 1, 8, 0, s)).toISOString();
const putDirect = (ctx, sid, messageId, senderRole, body, createdAt, name = "أ. أحمد") => ctx.setJson(directPrefix(sid) + messageId + ".json", { schemaVersion: 1, messageId, kind: "direct", studentId: sid, senderRole, senderId: "secret-sender", senderDisplayName: name, body, createdAt, classIdAtSend: CA });
const putAnn = (ctx, cid, messageId, body, createdAt) => ctx.setJson(announcementPrefix(cid) + messageId + ".json", { schemaVersion: 1, messageId, kind: "announcement", classId: cid, senderRole: "teacher", senderId: "secret-sender", senderDisplayName: "أ. أحمد", body, createdAt });
const everything = ctx => JSON.stringify(ctx.names("").map(n => [n, ctx.store.get(n).etag]));

describe("GET ?view=notifications — contents and projection", () => {
  it("direct TEACHER messages + current-class announcements only; own replies, other students and other classes never appear", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, S1, mid(1800000000001, "a"), "teacher", "راجع الواجب الثاني", at(1));
    putDirect(ctx, S1, mid(1800000000002, "b"), "student", "حاضر يا أستاذ", at(2));             // own reply
    putAnn(ctx, CA, mid(1800000000003, "c"), "الاختبار يوم الأحد", at(3));
    putDirect(ctx, S2, mid(1800000000004, "d"), "teacher", "رسالة لطالب آخر", at(4));            // another student
    putAnn(ctx, CB, mid(1800000000005, "e"), "إعلان صف آخر", at(5));                            // another class
    const r = await notifications(ctx, S1);
    expect(r.status).toBe(200);
    expect(r.jsonBody.items).toEqual([
      { id: mid(1800000000003, "c"), type: "announcement", senderDisplayName: "أ. أحمد", preview: "الاختبار يوم الأحد", createdAt: at(3), unread: true },
      { id: mid(1800000000001, "a"), type: "direct", senderDisplayName: "أ. أحمد", preview: "راجع الواجب الثاني", createdAt: at(1), unread: true }
    ]);
    const json = JSON.stringify(r.jsonBody);
    for (const leak of ["secret-sender", S1, S2, CA, CB, "platform/", "classIdAtSend", "studentId", "حاضر", "طالب آخر", "صف آخر"]) expect(json).not.toContain(leak);
  });

  it("the summary is EXACTLY ?view=unread's (one authority), from the same markers", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, S1, mid(1800000000001, "a"), "teacher", "1", at(1));
    putDirect(ctx, S1, mid(1800000000002, "b"), "teacher", "2", at(2));
    putAnn(ctx, CA, mid(1800000000003, "c"), "3", at(3));
    const n = (await notifications(ctx, S1)).jsonBody;
    const u = (await sGet(ST(ctx, S1), "?view=unread")).jsonBody;
    const { items, ...summary } = n;
    expect(summary).toEqual(u);
    expect(summary).toMatchObject({ totalUnread: 3, totalCapped: false, directUnread: { unread: 2, capped: false }, announcementUnread: { unread: 1, capped: false } });
    expect(items.filter(i => i.unread)).toHaveLength(3);
  });

  it("request studentId / classId parameters are ignored (identity comes from the session only)", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, S2, mid(1800000000001, "a"), "teacher", "لـ S2", at(1));
    putAnn(ctx, CB, mid(1800000000002, "b"), "لصف ب", at(2));
    const r = await notifications(ctx, S1, "&studentId=" + S2 + "&classId=" + CB);
    expect(r.jsonBody.items).toEqual([]);
    expect(r.jsonBody.totalUnread).toBe(0);
  });

  it("no session → 401 (the handler's own session check)", async () => {
    const ctx = createMemoryContainer(seed());
    expect((await sGet(ANON(ctx), "?view=notifications")).status).toBe(401);
  });

  it("archived class: announcements stay listed (readable history); no class: direct only", async () => {
    const ctx = createMemoryContainer({ ...seed(), ["platform/users/" + S2 + ".json"]: user(S2, { classId: "" }) });
    putAnn(ctx, CX, mid(1800000000001, "a"), "إعلان قديم", at(1));
    putDirect(ctx, S2, mid(1800000000002, "b"), "teacher", "مرحبًا", at(2));
    expect((await notifications(ctx, S4)).jsonBody.items.map(i => i.preview)).toEqual(["إعلان قديم"]);
    expect((await notifications(ctx, S2)).jsonBody.items.map(i => [i.type, i.preview])).toEqual([["direct", "مرحبًا"]]);
  });

  it("newest first, at most NOTIFICATION_LIMIT items; previews are single-line and bounded", async () => {
    const ctx = createMemoryContainer(seed());
    for (let i = 1; i <= 12; i++) putDirect(ctx, S1, mid(1800000000000 + i, "a"), "teacher", "رسالة " + i, at(2 * i));
    for (let i = 1; i <= 12; i++) putAnn(ctx, CA, mid(1800000000100 + i, "b"), "إعلان " + i, at(2 * i + 1));
    const items = (await notifications(ctx, S1)).jsonBody.items;
    expect(items).toHaveLength(NOTIFICATION_LIMIT);
    expect(items[0]).toMatchObject({ type: "announcement", preview: "إعلان 12" });
    expect(items[1]).toMatchObject({ type: "direct", preview: "رسالة 12" });
    const times = items.map(i => Date.parse(i.createdAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(previewOf("  سطر أول\n\n  سطر   ثانٍ ")).toBe("سطر أول سطر ثانٍ");
    const long = previewOf("ع".repeat(500));
    expect(Array.from(long)).toHaveLength(PREVIEW_LENGTH);
    expect(long.endsWith("…")).toBe(true);
  });

  it("a thread made of the student's own replies never makes the scan unbounded (bounded downloads)", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, S1, mid(1700000000000, "a"), "teacher", "قديمة جدًا", at(0));
    for (let i = 1; i <= 200; i++) putDirect(ctx, S1, mid(1800000000000 + i, "b"), "student", "رد " + i, at(1));
    let downloaded = 0;
    const deps = { ...ST(ctx, S1), downloadManyJson: async (c, names) => { downloaded += names.length; return Promise.all(names.map(n => ctx.getJson(n) ?? null)); } };
    const r = await sGet(deps, "?view=notifications");
    expect(r.status).toBe(200);
    expect(r.jsonBody.items).toEqual([]);                                        // the old teacher message is beyond the bound
    expect(r.jsonBody.directUnread).toEqual({ unread: 1, capped: false });       // …but the authoritative count still has it
    expect(downloaded).toBeLessThan(300);                                        // 60 notification candidates + the count's candidates
  });
});

describe("read/unread semantics — the notification read is READ-ONLY", () => {
  it("fetching notifications (repeatedly) never writes: no marker, no absorption, no blob touched", async () => {
    const ctx = createMemoryContainer(seed());
    // A legacy window made only of the student's OWN messages: the thread GET would absorb it; notifications must not.
    putDirect(ctx, S1, mid(1700000000001, "a"), "student", "رد قديم", at(1));
    putDirect(ctx, S1, mid(1800000000002, "b"), "teacher", "جديد", at(2));
    putAnn(ctx, CA, mid(1800000000003, "c"), "إعلان", at(3));
    const before = everything(ctx);
    for (let i = 0; i < 3; i++) expect((await notifications(ctx, S1)).status).toBe(200);
    expect(everything(ctx)).toBe(before);
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([]);
    expect((await sGet(ST(ctx, S1), "?view=unread")).jsonBody.totalUnread).toBe(2);
  });

  it("item flags follow the stored marker: mark through X → X read, a later Y stays unread; announcements untouched", async () => {
    const ctx = createMemoryContainer(seed());
    const X = mid(1800000000001, "a"), Y = mid(1800000000002, "b"), A = mid(1800000000003, "c");
    putDirect(ctx, S1, X, "teacher", "X", at(1));
    putAnn(ctx, CA, A, "A", at(3));
    const mark = await sPost(ST(ctx, S1), { action: "markRead", stream: "direct", throughMessageId: X, seenIdsAtBoundary: [X] });
    expect(mark.status).toBe(200);
    putDirect(ctx, S1, Y, "teacher", "Y", at(2));                                // arrives after the acknowledgement
    const n = (await notifications(ctx, S1)).jsonBody;
    expect(Object.fromEntries(n.items.map(i => [i.preview, i.unread]))).toEqual({ X: false, Y: true, A: true });
    expect(n.directUnread).toEqual({ unread: 1, capped: false });
    expect(n.announcementUnread).toEqual({ unread: 1, capped: false });
    expect(ctx.getJson(studentDirectStateName(S1))).toBeTruthy();
  });

  it("end-to-end with real sends: a teacher message and an announcement show up unread for that student only", async () => {
    const ctx = createMemoryContainer(seed());
    expect((await tPost(T(ctx), { action: "sendDirect", studentId: S1, body: "أحسنت في الاختبار" })).status).toBe(200);
    expect((await tPost(T(ctx), { action: "sendAnnouncement", classId: CA, body: "لا حصة غدًا" })).status).toBe(200);
    await sPost(ST(ctx, S1), { action: "sendDirect", body: "شكرًا" });
    const mine = (await notifications(ctx, S1)).jsonBody;
    expect(mine.items.map(i => [i.type, i.preview, i.unread]).sort()).toEqual([["announcement", "لا حصة غدًا", true], ["direct", "أحسنت في الاختبار", true]]);
    expect(mine.items.every(i => i.senderDisplayName === "أ. أحمد")).toBe(true);
    expect((await notifications(ctx, S2)).jsonBody.items).toEqual([]);
  });
});
