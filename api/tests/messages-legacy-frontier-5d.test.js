import { describe, it, expect } from "vitest";
import { handler as teacher } from "../src/functions/messages.js";
import { handler as studentApi } from "../src/functions/student-messages.js";
import { directPrefix, announcementPrefix, createMessage, LEGACY_UNREAD_PAGE_LIMIT } from "../src/lib/message-store.js";
import { READ_STATE_PREFIX, teacherDirectStateName, studentDirectStateName, studentAnnouncementStateName, loadMarker, isReadBy, markStreamRead } from "../src/lib/message-read-state.js";
import { readAckFromSnapshot } from "../../src/messages/messagesClient.ts";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 5D review follow-up (MEDIUM) — MULTIPLE LATE LEGACY GROUPS. In a stream longer than a page, legacy messages
// published late by a Phase 5C writer (e.g. across a rollback) sort below the whole sequenced tail. A page that showed
// only the NEWEST legacy group let its acknowledgement cover an OLDER late legacy message that was never shown. Every
// scenario here runs through the real handlers, the real memory container, the real CAS and the REAL client
// acknowledgement builder (readAckFromSnapshot) — nothing re-implements the acknowledgement. No timers, no sleeps.

const S1 = "11111111-1111-1111-1111-111111111111";
const CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const seed = () => ({
  ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "طالب", classId: CA, active: true, archived: false, authVersion: 1, identityNumber: "123456789" },
  ["platform/classes/" + CA + ".json"]: { classId: CA, name: "أ", active: true, studentIds: [] }
});
const req = (method, url, body) => ({ method, url, headers: { get: () => null }, json: async () => body });
const T = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "builder-1" } }), container: ctx.container, resolveTeacherDisplayName: async () => "أ. أحمد", recordAuditEvent: async () => {} });
const ST = ctx => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student", classId: CA } }) });
const tGet = (ctx, q) => teacher(req("GET", "https://x/api/messages" + q), T(ctx));
const tPost = (ctx, body) => teacher(req("POST", "https://x/api/messages", body), T(ctx));
const sGet = (ctx, q = "") => studentApi(req("GET", "https://x/api/student-messages" + q), ST(ctx));
const sPost = (ctx, body) => studentApi(req("POST", "https://x/api/student-messages", body), ST(ctx));

const legacyId = (ms, hex) => String(ms) + "-" + hex.repeat(16).slice(0, 16);
const oldDirect = (ctx, id, senderRole) => ctx.setJson(directPrefix(S1) + id + ".json", { schemaVersion: 1, messageId: id, kind: "direct", studentId: S1, senderRole, senderId: "x", senderDisplayName: "x", body: "L:" + id, createdAt: "", classIdAtSend: CA });
const oldAnnouncement = (ctx, id) => ctx.setJson(announcementPrefix(CA) + id + ".json", { schemaVersion: 1, messageId: id, kind: "announcement", classId: CA, senderRole: "teacher", senderId: "x", senderDisplayName: "x", body: "L:" + id, createdAt: "" });
async function sequencedDirect(ctx, senderRole, n) {
  for (let i = 0; i < n; i++) await createMessage(ctx.container, directPrefix(S1), (messageId, createdAt) => ({ schemaVersion: 1, messageId, kind: "direct", studentId: S1, senderRole, senderId: "x", senderDisplayName: "x", body: "S" + i, createdAt, classIdAtSend: CA }));
}
async function sequencedAnnouncements(ctx, n) {
  for (let i = 0; i < n; i++) await createMessage(ctx.container, announcementPrefix(CA), (messageId, createdAt) => ({ schemaVersion: 1, messageId, kind: "announcement", classId: CA, senderRole: "teacher", senderId: "x", senderDisplayName: "x", body: "A" + i, createdAt }));
}

// Open = GET the page, then acknowledge exactly what it showed with the client's own builder.
const STREAMS = {
  teacher: { get: ctx => tGet(ctx, "?studentId=" + S1).then(r => r.jsonBody.messages), relevant: m => m.senderRole === "student", mark: (ctx, ack) => tPost(ctx, { action: "markDirectRead", studentId: S1, ...ack }), unread: async ctx => (await tGet(ctx, "?kind=unread-summary")).jsonBody.totalUnread, state: () => teacherDirectStateName("builder-1", S1) },
  studentDirect: { get: ctx => sGet(ctx).then(r => r.jsonBody.direct), relevant: m => m.senderRole === "teacher", mark: (ctx, ack) => sPost(ctx, { action: "markRead", stream: "direct", ...ack }), unread: async ctx => (await sGet(ctx, "?view=unread")).jsonBody.directUnread.unread, state: () => studentDirectStateName(S1) },
  announcements: { get: ctx => sGet(ctx).then(r => r.jsonBody.announcements), relevant: () => true, mark: (ctx, ack) => sPost(ctx, { action: "markRead", stream: "announcements", ...ack }), unread: async ctx => (await sGet(ctx, "?view=unread")).jsonBody.announcementUnread.unread, state: () => studentAnnouncementStateName(S1, CA) }
};
async function open(ctx, s) {
  const shown = await s.get(ctx);
  const ack = readAckFromSnapshot(shown, s.relevant);
  const r = ack ? await s.mark(ctx, ack) : null;
  return { ids: shown.map(m => m.messageId), r };
}
// Every id that is read now must either have been shown by some page, or have been read before (history).
async function assertNothingReadUnseen(ctx, s, ids, shownEver) {
  const marker = await loadMarker(ctx.container, s.state());
  for (const id of ids) if (isReadBy(marker, id)) expect([id, shownEver.has(id)]).toEqual([id, true]);
}

// A stream LONGER than its page: announcements page = 50, direct page = 100.
async function longStream(ctx, which) {
  if (which === "announcements") await sequencedAnnouncements(ctx, 51);
  else await sequencedDirect(ctx, which === "teacher" ? "student" : "teacher", 101);
}
const writeLegacy = (ctx, which, id) => (which === "announcements" ? oldAnnouncement(ctx, id) : oldDirect(ctx, id, which === "teacher" ? "student" : "teacher"));

describe("two late legacy groups in a stream longer than its page: the older one is shown before it can become read", () => {
  for (const which of ["announcements", "teacher", "studentDirect"]) {
    it(which, async () => {
      const ctx = createMemoryContainer(seed());
      const s = STREAMS[which];
      await longStream(ctx, which);
      expect((await open(ctx, s)).r.status).toBe(200);                                   // existing history acknowledged
      expect(await s.unread(ctx)).toBe(0);
      const L1 = legacyId(1800000000001, "1"), L2 = legacyId(1800000000002, "2");         // T1 < T2, rollback writer
      writeLegacy(ctx, which, L1); writeLegacy(ctx, which, L2);
      expect(await s.unread(ctx)).toBe(2);
      const o = await open(ctx, s);
      expect([o.ids.includes(L1), o.ids.includes(L2)]).toEqual([true, true]);           // BOTH shown before the ack
      expect(o.r.status).toBe(200);
      expect(await s.unread(ctx)).toBe(0);
      await assertNothingReadUnseen(ctx, s, [L1, L2], new Set(o.ids));
    });
  }
});

describe("three+ legacy groups and same-millisecond groups", () => {
  it("L1 @T1, L2 @T2, L3 @T3 (+ a same-ms pair) are all shown; no middle/older group disappears", async () => {
    const ctx = createMemoryContainer(seed());
    const s = STREAMS.announcements;
    await longStream(ctx, "announcements");
    await open(ctx, s);
    const ids = [legacyId(1800000000001, "1"), legacyId(1800000000002, "2"), legacyId(1800000000002, "7"), legacyId(1800000000003, "3"), legacyId(1800000000004, "4")];
    ids.forEach(id => oldAnnouncement(ctx, id));
    expect(await s.unread(ctx)).toBe(5);
    const o = await open(ctx, s);
    expect(ids.every(id => o.ids.includes(id))).toBe(true);
    expect(o.ids.length).toBe(50 + ids.length);                                           // tail + the unread legacy frontier
    expect(new Set(o.ids).size).toBe(o.ids.length);                                      // no duplicates
    expect(await s.unread(ctx)).toBe(0);
  });

  it("same-ms legacy semantics are preserved: a later same-ms id sorting LOWER than the acknowledged ones stays unread", async () => {
    const ctx = createMemoryContainer(seed());
    const s = STREAMS.teacher;
    await longStream(ctx, "teacher");
    await open(ctx, s);
    const t = 1800000000500;
    oldDirect(ctx, legacyId(t, "5"), "student"); oldDirect(ctx, legacyId(t, "9"), "student");
    const o = await open(ctx, s);
    expect(o.ids).toEqual(expect.arrayContaining([legacyId(t, "5"), legacyId(t, "9")]));
    const C = legacyId(t, "1");                                                           // same ms, sorts below both
    oldDirect(ctx, C, "student");
    expect(await s.unread(ctx)).toBe(1);
    const marker = await loadMarker(ctx.container, s.state());
    expect([isReadBy(marker, legacyId(t, "5")), isReadBy(marker, legacyId(t, "9")), isReadBy(marker, C)]).toEqual([true, true, false]);
    const again = await open(ctx, s);
    expect(again.ids).toContain(C);
    expect(await s.unread(ctx)).toBe(0);
  });
});

describe("legacy-only acknowledgement keeps the existing sequenced progress", () => {
  it("a marker with sequenced progress + an acknowledgement carrying only a legacy (primary) part → sequenced unchanged, legacy advanced", async () => {
    const ctx = createMemoryContainer(seed());
    const L = legacyId(1700000000001, "a");
    oldDirect(ctx, L, "student");
    await sequencedDirect(ctx, "student", 2);
    const ids = (await tGet(ctx, "?studentId=" + S1)).jsonBody.messages.map(m => m.messageId);
    const [s1, s2] = ids.slice(-2);
    const stream = { stateName: teacherDirectStateName("builder-1", S1), streamPrefix: directPrefix(S1), expected: { kind: "direct", studentId: S1 }, include: d => d.senderRole === "student" };
    await markStreamRead(ctx.container, { ...stream, throughMessageId: s1, seenIdsAtBoundary: [s1] });
    const before = ctx.getJson(stream.stateName).sequenced;
    await markStreamRead(ctx.container, { ...stream, throughMessageId: L, seenIdsAtBoundary: [L] });   // e.g. an older tab's snapshot
    const doc = ctx.getJson(stream.stateName);
    expect(doc.sequenced).toEqual(before);
    expect(doc.legacy).toEqual({ boundaryMs: 1700000000001, seenIdsAtBoundary: [L] });
    const marker = await loadMarker(ctx.container, stream.stateName);
    expect([isReadBy(marker, L), isReadBy(marker, s1), isReadBy(marker, s2)]).toEqual([true, true, false]);
  });
});

describe("bounded frontier: more unread legacy than a page may carry — nothing unseen is ever read", () => {
  const N = LEGACY_UNREAD_PAGE_LIMIT + 3;
  const ids = Array.from({ length: N }, (_, i) => legacyId(1800000000000 + i, "c"));

  it("the page carries the OLDEST unread legacy ids up to the bound; the rest stay unread and follow on the next page", async () => {
    const ctx = createMemoryContainer(seed());
    const s = STREAMS.announcements;
    await longStream(ctx, "announcements");
    await open(ctx, s);
    ids.forEach(id => oldAnnouncement(ctx, id));
    expect(await s.unread(ctx)).toBe(Math.min(N, 99));                                       // display cap: 99 (+)
    const first = await open(ctx, s);
    const shown = new Set(first.ids);
    expect(ids.filter(id => shown.has(id))).toEqual(ids.slice(0, LEGACY_UNREAD_PAGE_LIMIT));   // oldest first, bounded
    expect(await s.unread(ctx)).toBe(3);                                                 // the omitted ones stay unread
    await assertNothingReadUnseen(ctx, s, ids, shown);
    const second = await open(ctx, s);
    second.ids.forEach(id => shown.add(id));
    expect(ids.slice(-3).every(id => second.ids.includes(id))).toBe(true);                // eventually observed
    expect(await s.unread(ctx)).toBe(0);
    await assertNothingReadUnseen(ctx, s, ids, shown);
  });

  it("a pure legacy (5C) history longer than the bound, never acknowledged: advances only as far as it was shown", async () => {
    const ctx = createMemoryContainer(seed());
    const s = STREAMS.teacher;
    ids.forEach(id => oldDirect(ctx, id, "student"));
    expect(await s.unread(ctx)).toBe(Math.min(N, 99));                                       // display cap: 99 (+)
    const shown = new Set();
    const first = await open(ctx, s);
    first.ids.forEach(id => shown.add(id));
    expect(first.ids).toEqual(ids.slice(0, LEGACY_UNREAD_PAGE_LIMIT));
    expect(await s.unread(ctx)).toBe(3);
    await assertNothingReadUnseen(ctx, s, ids, shown);
    const second = await open(ctx, s);
    second.ids.forEach(id => shown.add(id));
    expect(await s.unread(ctx)).toBe(0);
    await assertNothingReadUnseen(ctx, s, ids, shown);
  });

  it("NO HIDDEN-MESSAGE ACKNOWLEDGEMENT: acknowledging a legacy id the page omitted is refused (400) with zero marker mutation", async () => {
    const ctx = createMemoryContainer(seed());
    const s = STREAMS.announcements;
    await longStream(ctx, "announcements");
    await open(ctx, s);
    ids.forEach(id => oldAnnouncement(ctx, id));
    const page = await s.get(ctx);
    const omitted = ids[N - 1];
    expect(page.map(m => m.messageId)).not.toContain(omitted);
    const X = page.at(-1).messageId;                                                      // the page's latest sequenced id
    const snapshot = JSON.stringify(ctx.names(READ_STATE_PREFIX).map(n => [n, ctx.store.get(n).etag]));
    for (const legacy of [omitted, ids[LEGACY_UNREAD_PAGE_LIMIT]]) {
      const r = await s.mark(ctx, { throughMessageId: X, seenIdsAtBoundary: [X], legacyThroughMessageId: legacy, legacySeenIdsAtBoundary: [legacy] });
      expect(r.status).toBe(400);
    }
    expect(JSON.stringify(ctx.names(READ_STATE_PREFIX).map(n => [n, ctx.store.get(n).etag]))).toBe(snapshot);
    expect(await s.unread(ctx)).toBe(Math.min(N, 99));                                       // display cap: 99 (+)
    // the last id the page DID show is accepted
    const last = ids[LEGACY_UNREAD_PAGE_LIMIT - 1];
    expect((await s.mark(ctx, { throughMessageId: X, seenIdsAtBoundary: [X], legacyThroughMessageId: last, legacySeenIdsAtBoundary: [last] })).status).toBe(200);
    expect(await s.unread(ctx)).toBe(3);
  });
});
