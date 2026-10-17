import { describe, it, expect, beforeEach } from "vitest";
import { handler as teacherMessages } from "../src/functions/messages.js";
import { handler as studentMessages } from "../src/functions/student-messages.js";
import { directPrefix, announcementPrefix, sequencedMessageId } from "../src/lib/message-store.js";
import { teacherDirectUnread, READ_STATE_PREFIX } from "../src/lib/message-read-state.js";
import { createUnreadMemo } from "../src/lib/message-unread-memo.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Messages M.3b — READ COST of the unread badges (audit #1 / #2). A poll in which nothing changed downloads nothing; any
// change by any writer (a new message, a direct legacy write, a deleted message, a mark) is seen by the NEXT poll,
// because a memoized count is only reused while the listing's ETags confirm it. Fail-first: the repeat-poll cases were
// run against 57b9b838 (see the PR).

const C1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const C2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const T1 = "teacher-1", T2 = "teacher-2";
const sid = i => "1111111" + String(i) + "-1111-1111-1111-111111111111";
const S = Array.from({ length: 10 }, (_, i) => sid(i));
const OTHER = Array.from({ length: 5 }, (_, i) => "2222222" + String(i) + "-2222-2222-2222-222222222222");
const user = (userId, classId) => ({ schemaVersion: 3, role: "student", userId, displayName: "طالب", classId, active: true, archived: false, authVersion: 1, identityNumber: "1" });
function seed() {
  const out = {
    ["platform/classes/" + C1 + ".json"]: { classId: C1, name: "أ", active: true, ownerId: T1 },
    ["platform/classes/" + C2 + ".json"]: { classId: C2, name: "ب", active: true, ownerId: T2 }
  };
  for (const s of S) out["platform/users/" + s + ".json"] = user(s, C1);
  for (const s of OTHER) out["platform/users/" + s + ".json"] = user(s, C2);
  return out;
}
let clock;
const TEACHER = (ctx, sub = T1, extra = {}) => ({ requireBuilderAuth: () => ({ ok: true, user: { sub, am: "multi-user" } }), container: ctx.container, resolveTeacherDisplayName: async () => "أ. أحمد", recordAuditEvent: async () => {}, notifyStudentOfNewMessage: async () => {}, now: () => clock, ...extra });
const STUDENT = (ctx, sub, extra = {}) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub, sv: 1, role: "student" } }), now: () => clock, ...extra });
const tGet = (deps, q) => teacherMessages({ method: "GET", url: "https://x/api/messages" + q, headers: { get: () => null } }, deps);
const tPost = (deps, body) => teacherMessages({ method: "POST", url: "https://x/api/messages", headers: { get: () => null }, json: async () => body }, deps);
const sGet = (deps, q = "") => studentMessages({ method: "GET", url: "https://x/api/student-messages" + q, headers: { get: () => null } }, deps);
const sPost = (deps, body) => studentMessages({ method: "POST", url: "https://x/api/student-messages", headers: { get: () => null }, json: async () => body }, deps);

function put(ctx, prefix, p, doc) { const id = sequencedMessageId(prefix, p); ctx.setJson(prefix + id + ".json", { schemaVersion: 1, messageId: id, createdAt: new Date(clock + p).toISOString(), ...doc(id) }); return id; }
const putReply = (ctx, s, p) => put(ctx, directPrefix(s), p, () => ({ kind: "direct", studentId: s, senderRole: "student", senderId: s, senderDisplayName: "طالب", body: "رد " + p }));
const putAnn = (ctx, c, p) => put(ctx, announcementPrefix(c), p, () => ({ kind: "announcement", classId: c, senderRole: "teacher", senderId: T1, senderDisplayName: "أ. أحمد", body: "إعلان " + p }));

/** Counts blob downloads by name prefix on the memory container. */
function countingDownloads(ctx) {
  const counts = new Map();
  const c = ctx.container, orig = c.getBlobClient.bind(c);
  c.getBlobClient = name => {
    const cl = orig(name), dl = cl.download.bind(cl);
    cl.download = async (...a) => { counts.set(name, (counts.get(name) || 0) + 1); return dl(...a); };
    return cl;
  };
  const by = prefix => [...counts.entries()].filter(([n]) => n.startsWith(prefix)).reduce((s, [, v]) => s + v, 0);
  return { by, total: () => by(""), reset: () => counts.clear() };
}
const badge = (ctx, sub = T1, q = "?kind=unread-summary") => tGet(TEACHER(ctx, sub), q).then(r => r.jsonBody);

beforeEach(() => { clock = Date.parse("2026-10-17T08:00:00.000Z"); });

describe("#1 / #2 — the teacher badge: a poll in which nothing changed downloads nothing", () => {
  it("10 conversations with unread replies (+5 of another tenant): the second poll downloads no message, marker or user", async () => {
    const ctx = createMemoryContainer(seed());
    for (const s of S) for (let p = 1; p <= 5; p++) putReply(ctx, s, p);
    for (const s of OTHER) for (let p = 1; p <= 5; p++) putReply(ctx, s, p);
    const dl = countingDownloads(ctx);
    expect(await badge(ctx)).toEqual({ ok: true, totalUnread: 50, capped: false });
    dl.reset();
    expect(await badge(ctx)).toEqual({ ok: true, totalUnread: 50, capped: false });
    expect(dl.by("platform/messages/direct/")).toBe(0);
    expect(dl.by(READ_STATE_PREFIX)).toBe(0);
    expect(dl.by("platform/users/")).toBe(0);
  });
  it("another tenant's conversations are never counted: none of their messages is ever downloaded", async () => {
    const ctx = createMemoryContainer(seed());
    for (const s of OTHER) for (let p = 1; p <= 5; p++) putReply(ctx, s, p);
    putReply(ctx, S[0], 1);
    const dl = countingDownloads(ctx);
    expect((await badge(ctx)).totalUnread).toBe(1);
    for (const s of OTHER) expect(dl.by(directPrefix(s))).toBe(0);
  });
  it("a new reply is counted by the very next poll, which downloads only that new message", async () => {
    const ctx = createMemoryContainer(seed());
    putReply(ctx, S[0], 1);
    expect((await badge(ctx)).totalUnread).toBe(1);
    expect((await sPost(STUDENT(ctx, S[1]), { action: "sendDirect", body: "سؤال" })).status).toBe(200);
    const dl = countingDownloads(ctx);
    expect((await badge(ctx)).totalUnread).toBe(2);
    expect(dl.by("platform/messages/direct/")).toBe(1);
  });
  it("writers that bypass every new code path (an old Phase 5C instance, a direct storage write, a deletion) are seen at once", async () => {
    const ctx = createMemoryContainer(seed());
    putReply(ctx, S[0], 1);
    expect((await badge(ctx)).totalUnread).toBe(1);
    const legacy = "1800000000000-aaaaaaaaaaaaaaaa";
    ctx.setJson(directPrefix(S[0]) + legacy + ".json", { schemaVersion: 1, messageId: legacy, kind: "direct", studentId: S[0], senderRole: "student", senderId: S[0], senderDisplayName: "طالب", body: "قديم", createdAt: "" });
    expect((await badge(ctx)).totalUnread).toBe(2);
    ctx.store.delete(directPrefix(S[0]) + legacy + ".json");
    expect((await badge(ctx)).totalUnread).toBe(1);
  });
  it("a mark-read is reflected by the next poll (the marker's ETag changed)", async () => {
    const ctx = createMemoryContainer(seed());
    const id = putReply(ctx, S[0], 1);
    putReply(ctx, S[1], 1);
    expect((await badge(ctx, T1, "?kind=unread-summary&classId=" + C1)).byStudent[S[0]]).toEqual({ unread: 1, capped: false });
    expect((await tPost(TEACHER(ctx), { action: "markDirectRead", studentId: S[0], throughMessageId: id, seenIdsAtBoundary: [id] })).status).toBe(200);
    const after = await badge(ctx, T1, "?kind=unread-summary&classId=" + C1);
    expect(after.byStudent[S[0]]).toBeUndefined();
    expect(after.totalUnread).toBe(1);
  });
  it("a student moved to another tenant's class leaves this teacher's badge at the next poll (user document ETag)", async () => {
    const ctx = createMemoryContainer(seed());
    putReply(ctx, S[0], 1);
    expect((await badge(ctx)).totalUnread).toBe(1);
    ctx.setJson("platform/users/" + S[0] + ".json", user(S[0], C2));
    expect((await badge(ctx)).totalUnread).toBe(0);
    expect((await badge(ctx, T2)).totalUnread).toBe(1);
  });
  it("the memo is per container and per teacher; deps: { unreadMemo: null } computes without it", async () => {
    const a = createMemoryContainer(seed()), b = createMemoryContainer(seed());
    putReply(a, S[0], 1);
    expect((await badge(a)).totalUnread).toBe(1);
    expect((await badge(b)).totalUnread).toBe(0);
    const memo = createUnreadMemo();
    expect(await teacherDirectUnread(a.container, T1, {}, { unreadMemo: memo })).toEqual({ totalUnread: 1, capped: false });
    expect(await teacherDirectUnread(a.container, T1, {}, { unreadMemo: null })).toEqual({ totalUnread: 1, capped: false });
  });
});

describe("#2 — the student badge", () => {
  it("80 unread announcements never opened: the second poll downloads none of them; a new one is counted at once", async () => {
    const ctx = createMemoryContainer(seed());
    for (let p = 1; p <= 80; p++) putAnn(ctx, C1, p);
    expect((await sGet(STUDENT(ctx, S[0]), "?view=unread")).jsonBody.announcementUnread).toEqual({ unread: 80, capped: false });
    const dl = countingDownloads(ctx);
    expect((await sGet(STUDENT(ctx, S[0]), "?view=unread")).jsonBody.announcementUnread).toEqual({ unread: 80, capped: false });
    expect(dl.by("platform/messages/announcements/")).toBe(0);
    expect(dl.by(READ_STATE_PREFIX)).toBe(0);
    putAnn(ctx, C1, 81);
    dl.reset();
    expect((await sGet(STUDENT(ctx, S[0]), "?view=unread")).jsonBody.announcementUnread).toEqual({ unread: 81, capped: false });
    expect(dl.by("platform/messages/announcements/")).toBe(1);
  });
  it("the notification view still counts from the markers it loaded for its items (no memo) and stays read-only", async () => {
    const ctx = createMemoryContainer(seed());
    for (let p = 1; p <= 3; p++) putAnn(ctx, C1, p);
    const r = await sGet(STUDENT(ctx, S[0]), "?view=notifications");
    expect(r.jsonBody.announcementUnread).toEqual({ unread: 3, capped: false });
    expect(r.jsonBody.items.filter(i => i.unread)).toHaveLength(3);
    expect(ctx.names(READ_STATE_PREFIX)).toHaveLength(0);
  });
});
