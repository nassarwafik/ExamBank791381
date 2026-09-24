import { describe, it, expect } from "vitest";
import { handler as teacher } from "../src/functions/messages.js";
import { handler as studentApi } from "../src/functions/student-messages.js";
import { directPrefix, announcementPrefix, createMessage, SEQUENCE_KEY_BASE } from "../src/lib/message-store.js";
import {
  READ_STATE_PREFIX, teacherDirectStateName, studentDirectStateName, studentAnnouncementStateName,
  loadMarker, isReadBy, markStreamRead, countUnread, MarkReadError
} from "../src/lib/message-read-state.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 5D review follow-up (MEDIUM) — LATE LEGACY MESSAGES. A Phase 5C writer (an instance still draining during a
// deploy, or a rollback new → old → new) keeps creating "<ms>-<random>" ids, whose order key is BELOW every sequenced
// key. A read marker from the sequenced domain must never cover such a message just because its key sorts lower:
// legacy read progress and sequenced read progress are separate domains. Old writers are modelled by writing the
// legacy blob exactly as Phase 5C did (create at "<Date.now()>-<16 hex>"), with chosen milliseconds so every case is
// exact. No timers, no sleeps.

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const user = userId => ({ schemaVersion: 3, role: "student", userId, displayName: "طالب", classId: CA, active: true, archived: false, authVersion: 1, identityNumber: "123456789" });
const seed = () => ({
  ["platform/users/" + S1 + ".json"]: user(S1),
  ["platform/users/" + S2 + ".json"]: user(S2),
  ["platform/classes/" + CA + ".json"]: { classId: CA, name: "أ", active: true, studentIds: [] }
});
const req = (method, url, body) => ({ method, url, headers: { get: () => null }, json: async () => body });
const T = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "builder-1" } }), container: ctx.container, resolveTeacherDisplayName: async () => "أ. أحمد", recordAuditEvent: async () => {} });
const ANON = ctx => ({ requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }), container: ctx.container });
const ST = (ctx, sid = S1) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: sid, sv: 1, role: "student", classId: CA } }) });
const tGet = (deps, q) => teacher(req("GET", "https://x/api/messages" + q), deps);
const tPost = (deps, body) => teacher(req("POST", "https://x/api/messages", body), deps);
const sGet = (deps, q = "") => studentApi(req("GET", "https://x/api/student-messages" + q), deps);
const sPost = (deps, body) => studentApi(req("POST", "https://x/api/student-messages", body), deps);

const legacyId = (ms, hex) => String(ms) + "-" + hex.repeat(16).slice(0, 16);
// A Phase 5C writer: one create of "<ms>-<random>" with the 5C document shape.
const oldDirect = (ctx, sid, id, senderRole, body = "legacy") => ctx.setJson(directPrefix(sid) + id + ".json", { schemaVersion: 1, messageId: id, kind: "direct", studentId: sid, senderRole, senderId: senderRole === "student" ? sid : "builder-1", senderDisplayName: "x", body, createdAt: new Date(Number(id.slice(0, 13))).toISOString(), classIdAtSend: CA });
const oldAnnouncement = (ctx, cid, id, body = "legacy") => ctx.setJson(announcementPrefix(cid) + id + ".json", { schemaVersion: 1, messageId: id, kind: "announcement", classId: cid, senderRole: "teacher", senderId: "builder-1", senderDisplayName: "x", body, createdAt: new Date(Number(id.slice(0, 13))).toISOString() });

// The acknowledgement the client builds from the snapshot it applied (mirrors messagesClient.readAckFromSnapshot):
// the latest relevant id + its same-key ids, and — when the snapshot also holds legacy ids — the latest relevant LEGACY
// id + its same-millisecond ids, so both read domains advance to exactly what was displayed.
const isLegacy = id => Number(id.slice(0, 13)) < SEQUENCE_KEY_BASE;
function ackFrom(messages, relevant) {
  const ids = messages.filter(relevant).map(m => m.messageId).sort();
  if (!ids.length) return null;
  const part = list => { const x = list[list.length - 1]; return [x, list.filter(id => id.slice(0, 13) === x.slice(0, 13))]; };
  const [throughMessageId, seenIdsAtBoundary] = part(ids);
  const ack = { throughMessageId, seenIdsAtBoundary };
  const legacy = ids.filter(isLegacy);
  if (!isLegacy(throughMessageId) && legacy.length) [ack.legacyThroughMessageId, ack.legacySeenIdsAtBoundary] = part(legacy);
  return ack;
}

// Teacher opens the conversation: GET the snapshot, acknowledge exactly it.
async function teacherOpens(ctx, sid = S1) {
  const view = await tGet(T(ctx), "?studentId=" + sid);
  const ack = ackFrom(view.jsonBody.messages, m => m.senderRole === "student");
  const r = await tPost(T(ctx), { action: "markDirectRead", studentId: sid, ...ack });
  expect(r.status).toBe(200);
  return { bodies: view.jsonBody.messages.map(m => m.body), unread: r.jsonBody.unread };
}
async function studentOpens(ctx, stream) {
  const view = await sGet(ST(ctx));
  const list = stream === "direct" ? view.jsonBody.direct : view.jsonBody.announcements;
  const ack = ackFrom(list, stream === "direct" ? m => m.senderRole === "teacher" : () => true);
  const r = await sPost(ST(ctx), { action: "markRead", stream, ...ack });
  expect(r.status).toBe(200);
  return { bodies: list.map(m => m.body), unread: r.jsonBody.unread };
}
const teacherUnread = async ctx => (await tGet(T(ctx), "?kind=unread-summary")).jsonBody.totalUnread;
const teacherByStudent = async ctx => (await tGet(T(ctx), "?kind=unread-summary&classId=" + CA)).jsonBody.byStudent;
const studentUnread = async ctx => (await sGet(ST(ctx), "?view=unread")).jsonBody;

describe("LATE LEGACY after a sequenced acknowledgement stays UNREAD (pre-fix reproduction)", () => {
  it("A — TEACHER reading STUDENT direct messages: S published + acknowledged, then an old writer publishes L → L unread (1)", async () => {
    const ctx = createMemoryContainer(seed());
    await tPost(T(ctx), { action: "sendDirect", studentId: S1, body: "T-new" });
    await sPost(ST(ctx), { action: "sendDirect", body: "S-new" });
    expect((await teacherOpens(ctx)).unread).toBe(0);
    oldDirect(ctx, S1, legacyId(1800000000000, "e"), "student", "LATE-LEGACY");
    expect(await teacherUnread(ctx)).toBe(1);
    expect(await teacherByStudent(ctx)).toEqual({ [S1]: { unread: 1, capped: false } });
    const opened = await teacherOpens(ctx);                                  // shown (display order: legacy first) → read
    expect(opened.bodies).toEqual(["LATE-LEGACY", "T-new", "S-new"]);
    expect(opened.unread).toBe(0);
    expect(await teacherUnread(ctx)).toBe(0);
  });

  it("B — STUDENT direct: S (teacher) acknowledged, then a late legacy teacher message → directUnread 1", async () => {
    const ctx = createMemoryContainer(seed());
    await tPost(T(ctx), { action: "sendDirect", studentId: S1, body: "S-new" });
    expect((await studentOpens(ctx, "direct")).unread).toBe(0);
    oldDirect(ctx, S1, legacyId(1800000000000, "e"), "teacher", "LATE-LEGACY");
    expect(await studentUnread(ctx)).toMatchObject({ directUnread: { unread: 1, capped: false }, announcementUnread: { unread: 0 }, totalUnread: 1 });
    expect((await studentOpens(ctx, "direct")).unread).toBe(0);
    expect((await studentUnread(ctx)).totalUnread).toBe(0);
  });

  it("C — STUDENT announcements: S acknowledged, then a late legacy announcement → announcementUnread 1", async () => {
    const ctx = createMemoryContainer(seed());
    await tPost(T(ctx), { action: "sendAnnouncement", classId: CA, body: "S-new" });
    expect((await studentOpens(ctx, "announcements")).unread).toBe(0);
    oldAnnouncement(ctx, CA, legacyId(1800000000000, "e"), "LATE-LEGACY");
    expect(await studentUnread(ctx)).toMatchObject({ announcementUnread: { unread: 1, capped: false }, directUnread: { unread: 0 }, totalUnread: 1 });
    expect((await studentOpens(ctx, "announcements")).unread).toBe(0);
    expect((await studentUnread(ctx)).totalUnread).toBe(0);
  });
});

describe("ROLLBACK new → old → new: old legacy writers are tolerated indefinitely", () => {
  it("S1 acknowledged; old writer L1, L2 → unread 2; open → read; L3 → unread; repeated transitions keep working", async () => {
    const ctx = createMemoryContainer(seed());
    await sPost(ST(ctx), { action: "sendDirect", body: "S1" });                               // new writer
    expect((await teacherOpens(ctx)).unread).toBe(0);
    oldDirect(ctx, S1, legacyId(1800000000001, "1"), "student", "L1");                        // rollback: old writer
    oldDirect(ctx, S1, legacyId(1800000000002, "2"), "student", "L2");
    expect(await teacherUnread(ctx)).toBe(2);
    expect((await teacherOpens(ctx)).unread).toBe(0);                                          // L1, L2 read
    oldDirect(ctx, S1, legacyId(1800000000003, "3"), "student", "L3");
    expect(await teacherUnread(ctx)).toBe(1);                                                  // L3 unread
    expect((await teacherOpens(ctx)).unread).toBe(0);
    await sPost(ST(ctx), { action: "sendDirect", body: "S2" });                               // re-deploy: new writer
    expect(await teacherUnread(ctx)).toBe(1);
    expect((await teacherOpens(ctx)).unread).toBe(0);
    oldDirect(ctx, S1, legacyId(1800000000004, "4"), "student", "L4");                        // rolled back again
    oldDirect(ctx, S1, legacyId(1800000000005, "5"), "student", "L5");
    expect(await teacherUnread(ctx)).toBe(2);
    expect((await teacherOpens(ctx)).bodies).toEqual(["L1", "L2", "L3", "L4", "L5", "S1", "S2"]);
    expect(await teacherUnread(ctx)).toBe(0);
    await sPost(ST(ctx), { action: "sendDirect", body: "S3" });
    expect(await teacherUnread(ctx)).toBe(1);
  });

  it("acknowledging a late legacy message, then ANOTHER late legacy message arrives → the new one is unread", async () => {
    const ctx = createMemoryContainer(seed());
    await tPost(T(ctx), { action: "sendDirect", studentId: S1, body: "S1" });
    expect((await studentOpens(ctx, "direct")).unread).toBe(0);
    oldDirect(ctx, S1, legacyId(1800000000010, "a"), "teacher", "L1");
    expect((await studentOpens(ctx, "direct")).unread).toBe(0);
    oldDirect(ctx, S1, legacyId(1800000000020, "b"), "teacher", "L2");
    expect((await studentUnread(ctx)).directUnread.unread).toBe(1);
  });
});

describe("MIXED history", () => {
  it("case 1–4 and alternating phases: every newly published message is unread in its own domain", async () => {
    const ctx = createMemoryContainer(seed());
    oldAnnouncement(ctx, CA, legacyId(1700000000001, "1"), "L1");                           // archived 5C history
    oldAnnouncement(ctx, CA, legacyId(1700000000002, "2"), "L2");
    await tPost(T(ctx), { action: "sendAnnouncement", classId: CA, body: "S1" });
    await tPost(T(ctx), { action: "sendAnnouncement", classId: CA, body: "S2" });
    expect((await studentUnread(ctx)).announcementUnread.unread).toBe(4);
    expect((await studentOpens(ctx, "announcements")).unread).toBe(0);
    // case 1: L1, L2, S1, S2 acknowledged → late L3 → unread
    oldAnnouncement(ctx, CA, legacyId(1800000000003, "3"), "L3");
    expect((await studentUnread(ctx)).announcementUnread.unread).toBe(1);
    // case 2: L3 acknowledged → S3 → unread
    expect((await studentOpens(ctx, "announcements")).unread).toBe(0);
    await tPost(T(ctx), { action: "sendAnnouncement", classId: CA, body: "S3" });
    expect((await studentUnread(ctx)).announcementUnread.unread).toBe(1);
    // case 3: S3 acknowledged → L4 → unread
    expect((await studentOpens(ctx, "announcements")).unread).toBe(0);
    oldAnnouncement(ctx, CA, legacyId(1800000000004, "4"), "L4");
    expect((await studentUnread(ctx)).announcementUnread.unread).toBe(1);
    // case 4: alternating phases
    let ms = 1800000000010;
    for (let round = 0; round < 3; round++) {
      expect((await studentOpens(ctx, "announcements")).unread).toBe(0);
      await tPost(T(ctx), { action: "sendAnnouncement", classId: CA, body: "S-r" + round });
      expect((await studentUnread(ctx)).announcementUnread.unread).toBe(1);
      oldAnnouncement(ctx, CA, legacyId(ms++, "c"), "L-r" + round);
      expect((await studentUnread(ctx)).announcementUnread.unread).toBe(2);
      expect((await studentOpens(ctx, "announcements")).unread).toBe(0);
      oldAnnouncement(ctx, CA, legacyId(ms++, "d"), "L-r" + round + "b");
      expect((await studentUnread(ctx)).announcementUnread.unread).toBe(1);
    }
  });

  it("SAME-MS legacy inside a mixed acknowledgement: a later same-ms legacy id (sorting lower) stays unread", async () => {
    const ctx = createMemoryContainer(seed());
    const t = 1800000000500;
    const A = legacyId(t, "5"), B = legacyId(t, "9");
    oldDirect(ctx, S1, A, "student"); oldDirect(ctx, S1, B, "student");
    await sPost(ST(ctx), { action: "sendDirect", body: "S1" });
    expect((await teacherOpens(ctx)).unread).toBe(0);
    const C = legacyId(t, "1");                                                               // same ms, sorts BELOW A and B
    oldDirect(ctx, S1, C, "student");
    expect(await teacherUnread(ctx)).toBe(1);
    const m = await loadMarker(ctx.container, teacherDirectStateName("builder-1", S1));
    expect([isReadBy(m, A), isReadBy(m, B), isReadBy(m, C)]).toEqual([true, true, false]);
  });

  it("a page smaller than the history still carries every unread legacy message, so legacy history never gets stuck unread", async () => {
    const ctx = createMemoryContainer(seed());
    for (const [ms, h] of [[1700000000001, "1"], [1700000000002, "2"], [1700000000003, "3"]]) oldDirect(ctx, S1, legacyId(ms, h), "student", "L" + h);
    for (let i = 1; i <= 4; i++) await sPost(ST(ctx), { action: "sendDirect", body: "S" + i });
    const page = await tGet(T(ctx), "?studentId=" + S1 + "&limit=2");
    expect(page.jsonBody.messages.map(m => m.body)).toEqual(["L1", "L2", "L3", "S3", "S4"]);   // all unread legacy shown
    expect(page.jsonBody.hasMore).toBe(true);
    const ack = ackFrom(page.jsonBody.messages, m => m.senderRole === "student");
    expect((await tPost(T(ctx), { action: "markDirectRead", studentId: S1, ...ack })).jsonBody.unread).toBe(0);
    oldDirect(ctx, S1, legacyId(1800000000000, "e"), "student", "LATE");                      // late legacy in a long stream
    expect(await teacherUnread(ctx)).toBe(1);
    const again = await tGet(T(ctx), "?studentId=" + S1 + "&limit=2");
    expect(again.jsonBody.messages.map(m => m.body)).toEqual(["LATE", "S3", "S4"]);           // visible → acknowledgeable
    const ack2 = ackFrom(again.jsonBody.messages, m => m.senderRole === "student");
    expect((await tPost(T(ctx), { action: "markDirectRead", studentId: S1, ...ack2 })).jsonBody.unread).toBe(0);
  });
});

describe("single-domain streams keep their exact semantics", () => {
  it("LEGACY-only: L1, L2, L3 with an acknowledgement through L2 → L3 unread", async () => {
    const ctx = createMemoryContainer(seed());
    const [L1, L2, L3] = [legacyId(1700000000001, "1"), legacyId(1700000000002, "2"), legacyId(1700000000003, "3")];
    oldDirect(ctx, S1, L1, "student"); oldDirect(ctx, S1, L2, "student");
    expect((await teacherOpens(ctx)).unread).toBe(0);
    oldDirect(ctx, S1, L3, "student");
    expect(await teacherUnread(ctx)).toBe(1);
    const m = await loadMarker(ctx.container, teacherDirectStateName("builder-1", S1));
    expect([L1, L2, L3].map(id => isReadBy(m, id))).toEqual([true, true, false]);
  });

  it("SEQUENCE-only: S1, S2, S3 with an acknowledgement of S2 → S3 unread", async () => {
    const ctx = createMemoryContainer(seed());
    await sPost(ST(ctx), { action: "sendDirect", body: "S1" });
    const s2 = (await sPost(ST(ctx), { action: "sendDirect", body: "S2" })).jsonBody.message.messageId;
    expect((await tPost(T(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: s2, seenIdsAtBoundary: [s2] })).jsonBody.unread).toBe(0);
    await sPost(ST(ctx), { action: "sendDirect", body: "S3" });
    expect(await teacherUnread(ctx)).toBe(1);
  });

  it("an acknowledgement without a legacy part (older client) never marks the displayed legacy messages read — fail-safe", async () => {
    const ctx = createMemoryContainer(seed());
    oldDirect(ctx, S1, legacyId(1700000000001, "1"), "student");
    const s1 = (await sPost(ST(ctx), { action: "sendDirect", body: "S1" })).jsonBody.message.messageId;
    expect((await tPost(T(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: s1, seenIdsAtBoundary: [s1] })).jsonBody.unread).toBe(1);
  });
});

describe("marker backward compatibility (no migration)", () => {
  const S_NAME = () => teacherDirectStateName("builder-1", S1);
  const count = async ctx => countUnread(ctx.container, { streamPrefix: directPrefix(S1), expected: { kind: "direct", studentId: S1 }, include: d => d.senderRole === "student", marker: await loadMarker(ctx.container, S_NAME()) });

  it("OLD marker with a SEQUENCED boundary: sequenced ≤ boundary read; legacy written before it read; legacy written after it UNREAD", async () => {
    const ctx = createMemoryContainer(seed());
    const before = legacyId(Date.parse("2026-09-01T00:00:00.000Z"), "a");
    oldDirect(ctx, S1, before, "student");
    const s1 = (await sPost(ST(ctx), { action: "sendDirect", body: "S1" })).jsonBody.message.messageId;
    const s2 = (await sPost(ST(ctx), { action: "sendDirect", body: "S2" })).jsonBody.message.messageId;
    ctx.setJson(S_NAME(), { schemaVersion: 1, principalRole: "teacher", boundaryMs: Number(s2.slice(0, 13)), seenIdsAtBoundary: [s2], updatedAt: "2026-09-10T00:00:00.000Z" });
    const after = legacyId(Date.parse("2026-09-20T00:00:00.000Z"), "b");
    oldDirect(ctx, S1, after, "student");
    const s3 = (await sPost(ST(ctx), { action: "sendDirect", body: "S3" })).jsonBody.message.messageId;
    const m = await loadMarker(ctx.container, S_NAME());
    expect([s1, s2, before].map(id => isReadBy(m, id))).toEqual([true, true, true]);          // nothing suddenly unread
    expect([after, s3].map(id => isReadBy(m, id))).toEqual([false, false]);                   // nothing wrongly read
    expect(await count(ctx)).toEqual({ unread: 2, capped: false });
    // the next acknowledgement upgrades the marker in place, keeping both domains' progress
    expect((await teacherOpens(ctx)).unread).toBe(0);
    const late = legacyId(Date.parse("2026-09-21T00:00:00.000Z"), "c");
    oldDirect(ctx, S1, late, "student");
    expect(await teacherUnread(ctx)).toBe(1);
  });

  it("OLD marker with a LEGACY boundary keeps the millisecond model; every sequenced message stays unread", async () => {
    const ctx = createMemoryContainer(seed());
    const [L1, L2, L3] = [legacyId(1700000000001, "1"), legacyId(1700000000002, "2"), legacyId(1700000000003, "3")];
    for (const id of [L1, L2, L3]) oldDirect(ctx, S1, id, "student");
    const s1 = (await sPost(ST(ctx), { action: "sendDirect", body: "S1" })).jsonBody.message.messageId;
    ctx.setJson(S_NAME(), { schemaVersion: 1, boundaryMs: 1700000000002, seenIdsAtBoundary: [L2], updatedAt: "2026-09-10T00:00:00.000Z" });
    const m = await loadMarker(ctx.container, S_NAME());
    expect([L1, L2, L3, s1].map(id => isReadBy(m, id))).toEqual([true, true, false, false]);
    expect(await count(ctx)).toEqual({ unread: 2, capped: false });
  });

  it("MISSING and MALFORMED markers read as 'nothing read' (fail-safe); a PARTIAL marker keeps the valid domain", async () => {
    const ctx = createMemoryContainer(seed());
    const L1 = legacyId(1700000000001, "1");
    oldDirect(ctx, S1, L1, "student");
    const s1 = (await sPost(ST(ctx), { action: "sendDirect", body: "S1" })).jsonBody.message.messageId;
    expect(await count(ctx)).toEqual({ unread: 2, capped: false });                            // missing
    for (const bad of [null, 7, "x", { boundaryMs: -1 }, { boundaryMs: "abc" }, { schemaVersion: 2, legacy: 5, sequenced: "x" }]) {
      ctx.setJson(S_NAME(), bad);
      expect(await count(ctx)).toEqual({ unread: 2, capped: false });
    }
    ctx.setJson(S_NAME(), { schemaVersion: 2, legacy: { boundaryMs: 1700000000001, seenIdsAtBoundary: [L1] } });
    let m = await loadMarker(ctx.container, S_NAME());
    expect([isReadBy(m, L1), isReadBy(m, s1)]).toEqual([true, false]);
    ctx.setJson(S_NAME(), { schemaVersion: 2, sequenced: { boundaryMs: Number(s1.slice(0, 13)), seenIdsAtBoundary: [s1] } });
    m = await loadMarker(ctx.container, S_NAME());
    expect([isReadBy(m, L1), isReadBy(m, s1)]).toEqual([false, true]);
    // a domain whose boundary is in the OTHER domain's key range is rejected (that domain reads as unread)
    ctx.setJson(S_NAME(), { schemaVersion: 2, legacy: { boundaryMs: Number(s1.slice(0, 13)), seenIdsAtBoundary: [s1] }, sequenced: { boundaryMs: 1700000000001, seenIdsAtBoundary: [L1] } });
    m = await loadMarker(ctx.container, S_NAME());
    expect([isReadBy(m, L1), isReadBy(m, s1)]).toEqual([false, false]);
  });

  it("the stored marker keeps the two domains separately (and stays a separate document)", async () => {
    const ctx = createMemoryContainer(seed());
    const L1 = legacyId(1700000000001, "1");
    oldDirect(ctx, S1, L1, "student");
    const s1 = (await sPost(ST(ctx), { action: "sendDirect", body: "S1" })).jsonBody.message.messageId;
    const before = JSON.stringify(ctx.names(directPrefix(S1)).map(n => ctx.getJson(n)));
    await teacherOpens(ctx);
    expect(ctx.getJson(S_NAME())).toMatchObject({
      schemaVersion: 2,
      legacy: { boundaryMs: 1700000000001, seenIdsAtBoundary: [L1] },
      sequenced: { boundaryMs: Number(s1.slice(0, 13)), seenIdsAtBoundary: [s1] }
    });
    expect(JSON.stringify(ctx.names(directPrefix(S1)).map(n => ctx.getJson(n)))).toBe(before);   // messages untouched
  });
});

describe("acknowledgement validation of the legacy part (400, zero marker change)", () => {
  it("rejects a legacy part that is not legacy, not listed, not relevant, another stream's, forged, mixed-ms or without a sequenced primary", async () => {
    const ctx = createMemoryContainer(seed());
    const L1 = legacyId(1700000000001, "1"), L2 = legacyId(1700000000002, "2"), LT = legacyId(1700000000003, "3");
    oldDirect(ctx, S1, L1, "student"); oldDirect(ctx, S1, L2, "student");
    oldDirect(ctx, S1, LT, "teacher");                                                          // the teacher's own message
    const other = legacyId(1700000000004, "4");
    oldDirect(ctx, S2, other, "student");                                                       // another student's stream
    const s1 = (await sPost(ST(ctx), { action: "sendDirect", body: "S1" })).jsonBody.message.messageId;
    const cases = [
      { throughMessageId: L2, seenIdsAtBoundary: [L2], legacyThroughMessageId: L1, legacySeenIdsAtBoundary: [L1] },   // primary not sequenced
      { throughMessageId: s1, seenIdsAtBoundary: [s1], legacyThroughMessageId: s1, legacySeenIdsAtBoundary: [s1] },   // "legacy" part is sequenced
      { throughMessageId: s1, seenIdsAtBoundary: [s1], legacyThroughMessageId: LT, legacySeenIdsAtBoundary: [LT] },   // own message
      { throughMessageId: s1, seenIdsAtBoundary: [s1], legacyThroughMessageId: other, legacySeenIdsAtBoundary: [other] },   // wrong student
      { throughMessageId: s1, seenIdsAtBoundary: [s1], legacyThroughMessageId: legacyId(1700000000009, "9"), legacySeenIdsAtBoundary: [legacyId(1700000000009, "9")] },   // not listed
      { throughMessageId: s1, seenIdsAtBoundary: [s1], legacyThroughMessageId: L2, legacySeenIdsAtBoundary: [L1, L2] },   // mixed ms
      { throughMessageId: s1, seenIdsAtBoundary: [s1], legacyThroughMessageId: L2, legacySeenIdsAtBoundary: [] },   // empty list
      { throughMessageId: s1, seenIdsAtBoundary: [s1], legacyThroughMessageId: L2 },                                 // list missing
      { throughMessageId: s1, seenIdsAtBoundary: [s1], legacySeenIdsAtBoundary: [L2] },                              // X missing
      { throughMessageId: s1, seenIdsAtBoundary: [s1], legacyThroughMessageId: "../" + L2, legacySeenIdsAtBoundary: ["../" + L2] },   // traversal
      { throughMessageId: s1, seenIdsAtBoundary: [s1], legacyThroughMessageId: L2, legacySeenIdsAtBoundary: Array(201).fill(L2) }   // oversized
    ];
    for (const c of cases) {
      const r = await tPost(T(ctx), { action: "markDirectRead", studentId: S1, ...c });
      expect(r.status).toBe(400);
    }
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([]);
    expect((await tPost(ANON(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: s1, seenIdsAtBoundary: [s1], legacyThroughMessageId: L2, legacySeenIdsAtBoundary: [L2] })).status).toBe(401);
    // the student may not acknowledge its OWN legacy message through the legacy part either
    const t1 = (await tPost(T(ctx), { action: "sendDirect", studentId: S1, body: "T1" })).jsonBody.message.messageId;
    expect((await sPost(ST(ctx), { action: "markRead", stream: "direct", throughMessageId: t1, seenIdsAtBoundary: [t1], legacyThroughMessageId: L2, legacySeenIdsAtBoundary: [L2] })).status).toBe(400);
    expect((await sPost(ST(ctx), { action: "markRead", stream: "announcements", throughMessageId: t1, seenIdsAtBoundary: [t1], legacyThroughMessageId: LT, legacySeenIdsAtBoundary: [LT] })).status).toBe(400);
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([]);
    // a valid mixed acknowledgement succeeds
    expect((await tPost(T(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: s1, seenIdsAtBoundary: [s1], legacyThroughMessageId: L2, legacySeenIdsAtBoundary: [L2] })).jsonBody).toMatchObject({ ok: true, unread: 0 });
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([teacherDirectStateName("builder-1", S1)]);
    expect(studentDirectStateName(S1)).not.toBe(studentAnnouncementStateName(S1, CA));
  });
});

describe("CAS per domain: concurrent acknowledgements never lose an advance", () => {
  const name = teacherDirectStateName("builder-1", S1);
  const stream = { stateName: name, streamPrefix: directPrefix(S1), expected: { kind: "direct", studentId: S1 }, include: d => d.senderRole === "student", meta: { principalRole: "teacher" } };
  const put = (ctx, id) => oldDirect(ctx, S1, id, "student");
  async function sequenced(ctx, n) {
    const ids = [];
    for (let i = 0; i < n; i++) ids.push((await createMessage(ctx.container, directPrefix(S1), (messageId, createdAt) => ({ schemaVersion: 1, messageId, kind: "direct", studentId: S1, senderRole: "student", senderId: S1, senderDisplayName: "x", body: "s" + i, createdAt, classIdAtSend: CA }))).messageId);
    return ids;
  }
  // `inject(api)` runs exactly once, between this writer's marker read and its conditional write.
  const racing = (inject) => { let fired = false; return { hooks: { beforeConditionalUpload(n, api) { if (fired || n !== name) return; fired = true; inject(api); } }, fired: () => fired }; };

  it("a LEGACY ack and a SEQUENCED ack racing: both advances survive", async () => {
    const L1 = legacyId(1700000000001, "1");
    let s1;
    const race = racing(api => api.setJson(name, { schemaVersion: 2, legacy: { boundaryMs: 1700000000001, seenIdsAtBoundary: [L1] }, sequenced: null }));
    const ctx = createMemoryContainer(seed(), race.hooks);
    put(ctx, L1);
    [s1] = await sequenced(ctx, 1);
    ctx.setJson(name, { schemaVersion: 2, legacy: null, sequenced: null });                     // existing marker → CAS path
    await markStreamRead(ctx.container, { ...stream, throughMessageId: s1, seenIdsAtBoundary: [s1] });
    expect(race.fired()).toBe(true);
    const m = await loadMarker(ctx.container, name);
    expect([isReadBy(m, L1), isReadBy(m, s1)]).toEqual([true, true]);
  });

  it("two LEGACY acks racing: the newer boundary wins and an equal boundary unions (same-ms)", async () => {
    const t = 1700000000005;
    const A = legacyId(t, "a"), B = legacyId(t, "b"), Z = legacyId(t + 1, "c");
    // equal boundary: concurrent {t, [A]} vs ours {t, [B]} → union
    let race = racing(api => api.setJson(name, { schemaVersion: 2, legacy: { boundaryMs: t, seenIdsAtBoundary: [A] }, sequenced: null }));
    let ctx = createMemoryContainer(seed(), race.hooks);
    put(ctx, A); put(ctx, B); put(ctx, Z);
    const [seq] = await sequenced(ctx, 1);
    ctx.setJson(name, { schemaVersion: 2, legacy: { boundaryMs: 1600000000000, seenIdsAtBoundary: [] }, sequenced: null });
    await markStreamRead(ctx.container, { ...stream, throughMessageId: seq, seenIdsAtBoundary: [seq], legacyThroughMessageId: B, legacySeenIdsAtBoundary: [B] });
    expect(race.fired()).toBe(true);
    let m = await loadMarker(ctx.container, name);
    expect([isReadBy(m, A), isReadBy(m, B), isReadBy(m, Z), isReadBy(m, seq)]).toEqual([true, true, false, true]);
    // newer concurrent legacy boundary wins over our older one
    race = racing(api => api.setJson(name, { schemaVersion: 2, legacy: { boundaryMs: t + 1, seenIdsAtBoundary: [Z] }, sequenced: null }));
    ctx = createMemoryContainer(seed(), race.hooks);
    put(ctx, A); put(ctx, Z);
    ctx.setJson(name, { schemaVersion: 2, legacy: { boundaryMs: 1600000000000, seenIdsAtBoundary: [] }, sequenced: null });
    await markStreamRead(ctx.container, { ...stream, throughMessageId: A, seenIdsAtBoundary: [A] });
    expect(race.fired()).toBe(true);
    m = await loadMarker(ctx.container, name);
    expect([isReadBy(m, A), isReadBy(m, Z)]).toEqual([true, true]);
  });

  it("two SEQUENCED acks racing: the newer boundary wins; an older ack never regresses it; the legacy domain is untouched", async () => {
    const L1 = legacyId(1700000000001, "1");
    let ids;
    const race = racing(api => api.setJson(name, { schemaVersion: 2, legacy: { boundaryMs: 1700000000001, seenIdsAtBoundary: [L1] }, sequenced: { boundaryMs: Number(ids[2].slice(0, 13)), seenIdsAtBoundary: [ids[2]] } }));
    const ctx = createMemoryContainer(seed(), race.hooks);
    put(ctx, L1);
    ids = await sequenced(ctx, 4);
    ctx.setJson(name, { schemaVersion: 2, legacy: null, sequenced: { boundaryMs: Number(ids[0].slice(0, 13)), seenIdsAtBoundary: [ids[0]] } });
    await markStreamRead(ctx.container, { ...stream, throughMessageId: ids[1], seenIdsAtBoundary: [ids[1]] });   // older than the concurrent one
    expect(race.fired()).toBe(true);
    const m = await loadMarker(ctx.container, name);
    expect(ids.map(id => isReadBy(m, id))).toEqual([true, true, true, false]);
    expect(isReadBy(m, L1)).toBe(true);
  });

  it("truly concurrent mixed acknowledgements through the real CAS converge to the union of both", async () => {
    const ctx = createMemoryContainer(seed());
    const L1 = legacyId(1700000000001, "1"), L2 = legacyId(1700000000002, "2");
    put(ctx, L1); put(ctx, L2);
    const ids = await sequenced(ctx, 2);
    await Promise.all([
      markStreamRead(ctx.container, { ...stream, throughMessageId: ids[1], seenIdsAtBoundary: [ids[1]], legacyThroughMessageId: L1, legacySeenIdsAtBoundary: [L1] }),
      markStreamRead(ctx.container, { ...stream, throughMessageId: ids[0], seenIdsAtBoundary: [ids[0]], legacyThroughMessageId: L2, legacySeenIdsAtBoundary: [L2] })
    ]);
    const m = await loadMarker(ctx.container, name);
    expect([L1, L2, ...ids].map(id => isReadBy(m, id))).toEqual([true, true, true, true]);
    await expect(markStreamRead(ctx.container, { ...stream, throughMessageId: ids[1], seenIdsAtBoundary: [ids[1]], legacyThroughMessageId: ids[0], legacySeenIdsAtBoundary: [ids[0]] })).rejects.toBeInstanceOf(MarkReadError);
  });
});
