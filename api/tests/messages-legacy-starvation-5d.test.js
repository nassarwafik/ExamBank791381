import { describe, it, expect } from "vitest";
import { handler as teacher } from "../src/functions/messages.js";
import { handler as studentApi } from "../src/functions/student-messages.js";
import { directPrefix, createMessage, LEGACY_UNREAD_PAGE_LIMIT, LEGACY_FRONTIER_SCAN_LIMIT } from "../src/lib/message-store.js";
import { READ_STATE_PREFIX, teacherDirectStateName, studentDirectStateName, loadMarker, isReadBy, markStreamRead, MarkReadError, READER_RELEVANCE, absorbIrrelevantLegacy } from "../src/lib/message-read-state.js";
import { readAckFromSnapshot } from "../../src/messages/messagesClient.ts";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 5D review follow-up (MEDIUM) — OWN-MESSAGE STARVATION of the legacy frontier. The frontier budget
// (LEGACY_UNREAD_PAGE_LIMIT) must be spent only on unread legacy messages the READER must acknowledge (teacher ← student,
// student ← teacher). Previously the reader's own unread-by-boundary legacy messages consumed it, so an incoming legacy
// message behind 100+ of them was never shown and stayed unread for good, and the reader's newest own messages were
// hidden. Real handlers, real memory container, real CAS and the client's own readAckFromSnapshot. No timers.

const S1 = "11111111-1111-1111-1111-111111111111";
const CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const seed = () => ({
  ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "طالب", classId: CA, active: true, archived: false, authVersion: 1, identityNumber: "123456789" },
  ["platform/classes/" + CA + ".json"]: { classId: CA, name: "أ", active: true, studentIds: [] }
});
const req = (method, url, body) => ({ method, url, headers: { get: () => null }, json: async () => body });
const T = (ctx, extra = {}) => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "builder-1" } }), container: ctx.container, resolveTeacherDisplayName: async () => "أ. أحمد", recordAuditEvent: async () => {}, ...extra });
const ST = ctx => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student", classId: CA } }) });

const legacyId = (ms, i = 0) => String(ms) + "-" + (i % 16).toString(16).repeat(16);
const putLegacy = (ctx, id, senderRole) => ctx.setJson(directPrefix(S1) + id + ".json", { schemaVersion: 1, messageId: id, kind: "direct", studentId: S1, senderRole, senderId: "x", senderDisplayName: "x", body: "L:" + id, createdAt: "", classIdAtSend: CA });
async function sequenced(ctx, senderRole, n) {
  const ids = [];
  for (let i = 0; i < n; i++) ids.push((await createMessage(ctx.container, directPrefix(S1), (messageId, createdAt) => ({ schemaVersion: 1, messageId, kind: "direct", studentId: S1, senderRole, senderId: "x", senderDisplayName: "x", body: "S" + i, createdAt, classIdAtSend: CA }))).messageId);
  return ids;
}

// The two direct readers. `own` is the reader's role, `other` the role it must acknowledge.
const READERS = {
  teacher: {
    own: "teacher", other: "student", state: () => teacherDirectStateName("builder-1", S1),
    get: ctx => teacher(req("GET", "https://x/api/messages?studentId=" + S1), T(ctx)).then(r => r.jsonBody.messages),
    mark: (ctx, ack) => teacher(req("POST", "https://x/api/messages", { action: "markDirectRead", studentId: S1, ...ack }), T(ctx)),
    unread: async ctx => (await teacher(req("GET", "https://x/api/messages?kind=unread-summary"), T(ctx))).jsonBody.totalUnread
  },
  student: {
    own: "student", other: "teacher", state: () => studentDirectStateName(S1),
    get: ctx => studentApi(req("GET", "https://x/api/student-messages"), ST(ctx)).then(r => r.jsonBody.direct),
    mark: (ctx, ack) => studentApi(req("POST", "https://x/api/student-messages", { action: "markRead", stream: "direct", ...ack }), ST(ctx)),
    unread: async ctx => (await studentApi(req("GET", "https://x/api/student-messages?view=unread"), ST(ctx))).jsonBody.directUnread.unread
  }
};
const relevantTo = r => (r.own === "teacher" ? m => m.senderRole === "student" : m => m.senderRole === "teacher");
// Open = GET, then acknowledge exactly what was shown with the client's own builder. `shown` accumulates every id shown.
async function open(ctx, r, shown) {
  const msgs = await r.get(ctx);
  msgs.forEach(m => shown.add(m.messageId));
  const ack = readAckFromSnapshot(msgs, relevantTo(r));
  const res = ack ? await r.mark(ctx, ack) : null;
  return { ids: msgs.map(m => m.messageId), status: res && res.status };
}
const marker = (ctx, r) => loadMarker(ctx.container, r.state());
const readUnseen = async (ctx, r, ids, shown) => { const m = await marker(ctx, r); return ids.filter(id => isReadBy(m, id) && !shown.has(id)); };
const stillUnread = async (ctx, r, ids) => { const m = await marker(ctx, r); return ids.filter(id => !isReadBy(m, id)); };

describe("own messages never consume the frontier: 100 / 150 own legacy messages above the boundary, then an incoming L", () => {
  for (const [who, nOwn] of [["teacher", 100], ["teacher", 150], ["student", 100], ["student", 150]]) {
    it(who + " — " + nOwn + " own messages", async () => {
      const ctx = createMemoryContainer(seed());
      const r = READERS[who];
      const shown = new Set();
      putLegacy(ctx, legacyId(1700000000000), r.other);                                 // a message the reader acknowledged
      await open(ctx, r, shown);
      const own = Array.from({ length: nOwn }, (_, i) => legacyId(1700000001000 + i, i));
      own.forEach(id => putLegacy(ctx, id, r.own));                                      // the reader's own legacy messages
      const L = legacyId(1800000000000, 14);
      putLegacy(ctx, L, r.other);                                                        // incoming legacy (e.g. a rollback)
      expect(await r.unread(ctx)).toBe(1);
      const o = await open(ctx, r, shown);
      expect(o.ids).toContain(L);                                                        // L is shown …
      expect(o.status).toBe(200);
      expect(await r.unread(ctx)).toBe(0);                                               // … and acknowledged
      expect(o.ids).toContain(own[nOwn - 1]);                                            // the newest own message stays visible
      expect(await readUnseen(ctx, r, [L], shown)).toEqual([]);
    });
  }

  it("teacher — 120 own messages + L, repeated polls: L never stays stuck", async () => {
    const ctx = createMemoryContainer(seed());
    const r = READERS.teacher; const shown = new Set();
    await sequenced(ctx, "student", 3);
    await open(ctx, r, shown);
    Array.from({ length: 120 }, (_, i) => legacyId(1700000001000 + i, i)).forEach(id => putLegacy(ctx, id, "teacher"));
    const L = legacyId(1800000000000, 14); putLegacy(ctx, L, "student");
    const unread = [];
    for (let poll = 0; poll < 3; poll++) { await open(ctx, r, shown); unread.push(await r.unread(ctx)); }
    expect(shown.has(L)).toBe(true);
    expect(unread).toEqual([0, 0, 0]);
  });

  it("an own run LONGER than the scan bound is folded into the boundary (no count change), then L is reached", async () => {
    const ctx = createMemoryContainer(seed());
    const r = READERS.teacher; const shown = new Set();
    const nOwn = LEGACY_FRONTIER_SCAN_LIMIT + 50;
    const own = Array.from({ length: nOwn }, (_, i) => legacyId(1700000001000 + i, i));
    own.forEach(id => putLegacy(ctx, id, "teacher"));
    const L = legacyId(1800000000000, 14); putLegacy(ctx, L, "student");
    expect(await r.unread(ctx)).toBe(1);
    const first = await open(ctx, r, shown);                                             // window = own only → folded
    expect(first.ids).not.toContain(L);
    expect(await r.unread(ctx)).toBe(1);                                                 // L stays unread, never read unseen
    expect(await readUnseen(ctx, r, [L], shown)).toEqual([]);
    const m = await marker(ctx, r);
    expect(isReadBy(m, own[LEGACY_FRONTIER_SCAN_LIMIT - 1]) && !isReadBy(m, own[LEGACY_FRONTIER_SCAN_LIMIT])).toBe(true);
    const second = await open(ctx, r, shown);                                            // the frontier now reaches L
    expect(second.ids).toContain(L);
    expect(await r.unread(ctx)).toBe(0);
    expect(await readUnseen(ctx, r, [L], shown)).toEqual([]);
  });
});

describe("mixed own / relevant: the frontier holds the OLDEST 100 RELEVANT unread messages", () => {
  it("80 own, 60 relevant, 80 own, 60 relevant (long stream) → 100 relevant first, then the remaining 20", async () => {
    const ctx = createMemoryContainer(seed());
    const r = READERS.teacher; const shown = new Set();
    await sequenced(ctx, "student", 101);                                                // a stream longer than its page
    await open(ctx, r, shown);
    let ms = 1800000000000;
    const relevant = [];
    for (const [role, n] of [["teacher", 80], ["student", 60], ["teacher", 80], ["student", 60]]) {
      for (let i = 0; i < n; i++) { const id = legacyId(ms++, i); putLegacy(ctx, id, role); if (role === "student") relevant.push(id); }
    }
    const first = await open(ctx, r, shown);
    expect(relevant.filter(id => first.ids.includes(id))).toEqual(relevant.slice(0, LEGACY_UNREAD_PAGE_LIMIT));
    expect(await stillUnread(ctx, r, relevant)).toEqual(relevant.slice(LEGACY_UNREAD_PAGE_LIMIT));   // exactly 20
    expect(await readUnseen(ctx, r, relevant, shown)).toEqual([]);
    const second = await open(ctx, r, shown);
    expect(relevant.slice(LEGACY_UNREAD_PAGE_LIMIT).every(id => second.ids.includes(id))).toBe(true);
    expect(await stillUnread(ctx, r, relevant)).toEqual([]);
    expect(await readUnseen(ctx, r, relevant, shown)).toEqual([]);
  });

  for (const n of [101, 150]) it(n + " relevant unread interleaved with own messages: oldest 100 relevant first, remainder next", async () => {
    const ctx = createMemoryContainer(seed());
    const r = READERS.student; const shown = new Set();
    await sequenced(ctx, "teacher", 101);
    await open(ctx, r, shown);
    const relevant = [];
    for (let i = 0; i < n; i++) {
      putLegacy(ctx, legacyId(1800000000000 + 2 * i, i), "student");                     // own
      const id = legacyId(1800000000000 + 2 * i + 1, i); putLegacy(ctx, id, "teacher"); relevant.push(id);
    }
    const first = await open(ctx, r, shown);
    expect(relevant.filter(id => first.ids.includes(id))).toEqual(relevant.slice(0, 100));
    expect((await stillUnread(ctx, r, relevant)).length).toBe(n - 100);
    await open(ctx, r, shown);
    expect(await stillUnread(ctx, r, relevant)).toEqual([]);
    expect(await readUnseen(ctx, r, relevant, shown)).toEqual([]);
  });
});

describe("own messages keep their normal display", () => {
  it("recent own messages inside the normal tail stay visible, with unread incoming ones around them", async () => {
    const ctx = createMemoryContainer(seed());
    const r = READERS.teacher; const shown = new Set();
    const ids = [];
    for (let i = 0; i < 30; i++) { const id = legacyId(1700000000000 + i, i); putLegacy(ctx, id, i % 3 ? "teacher" : "student"); ids.push(id); }
    const o = await open(ctx, r, shown);
    expect(o.ids).toEqual(ids);                                                          // the whole conversation, in order
  });
  it("a teacher-only legacy thread longer than the frontier: the newest own messages are displayed (tail), nothing counts unread", async () => {
    const ctx = createMemoryContainer(seed());
    const r = READERS.teacher;
    const own = Array.from({ length: 120 }, (_, i) => legacyId(1700000001000 + i, i));
    own.forEach(id => putLegacy(ctx, id, "teacher"));
    await sequenced(ctx, "student", 3);
    for (let poll = 0; poll < 2; poll++) {
      const ids = (await r.get(ctx)).map(m => m.messageId);
      expect(own.slice(-20).every(id => ids.includes(id))).toBe(true);
    }
    expect(await r.unread(ctx)).toBe(3);                                                 // only the 3 student messages
  });
});

describe("safety: crafted acknowledgements, absorption and CAS", () => {
  it("acknowledging a relevant legacy id outside the frontier (behind own messages) → 400, zero marker bytes, no sequenced advance", async () => {
    const ctx = createMemoryContainer(seed());
    const r = READERS.teacher;
    await sequenced(ctx, "student", 101);
    await open(ctx, r, new Set());
    const relevant = [];
    for (let i = 0; i < 150; i++) {
      putLegacy(ctx, legacyId(1800000000000 + 2 * i, i), "teacher");
      const id = legacyId(1800000000000 + 2 * i + 1, i); putLegacy(ctx, id, "student"); relevant.push(id);
    }
    const [fresh] = await sequenced(ctx, "student", 1);                                  // the primary part would advance
    const page = (await r.get(ctx)).map(m => m.messageId);
    const omitted = relevant.filter(id => !page.includes(id));
    expect(omitted).toEqual(relevant.slice(100));
    const bytes = JSON.stringify(ctx.names(READ_STATE_PREFIX).map(n => [n, ctx.store.get(n).etag, ctx.store.get(n).content.toString("utf8")]));
    for (const x of [omitted[0], omitted[25], omitted.at(-1)]) {
      expect((await r.mark(ctx, { throughMessageId: fresh, seenIdsAtBoundary: [fresh], legacyThroughMessageId: x, legacySeenIdsAtBoundary: [x] })).status).toBe(400);
    }
    expect(JSON.stringify(ctx.names(READ_STATE_PREFIX).map(n => [n, ctx.store.get(n).etag, ctx.store.get(n).content.toString("utf8")]))).toBe(bytes);
    expect(isReadBy(await marker(ctx, r), fresh)).toBe(false);
    // the last relevant id the page DID show is accepted
    expect((await r.mark(ctx, { throughMessageId: fresh, seenIdsAtBoundary: [fresh], legacyThroughMessageId: relevant[99], legacySeenIdsAtBoundary: [relevant[99]] })).status).toBe(200);
  });

  it("absorption never covers a relevant message — not even one sharing the last own message's millisecond", async () => {
    const ctx = createMemoryContainer(seed());
    const r = READERS.teacher; const shown = new Set();
    const nOwn = LEGACY_FRONTIER_SCAN_LIMIT;
    const own = Array.from({ length: nOwn }, (_, i) => legacyId(1700000001000 + i, 1));   // hex "1…"
    own.forEach(id => putLegacy(ctx, id, "teacher"));
    const sameMs = legacyId(1700000001000 + nOwn - 1, 15);                                // same ms as the last own, sorts after it
    putLegacy(ctx, sameMs, "student");
    await open(ctx, r, shown);
    const m = await marker(ctx, r);
    expect(isReadBy(m, sameMs) && !shown.has(sameMs)).toBe(false);
    await open(ctx, r, shown);
    expect(shown.has(sameMs)).toBe(true);
    expect(await r.unread(ctx)).toBe(0);
  });

  it("absorption refuses a run that would cover anything outside it (e.g. a relevant id in between) — nothing is written", async () => {
    const ctx = createMemoryContainer(seed());
    const name = teacherDirectStateName("builder-1", S1);
    const [own1, rel, own2] = [legacyId(1700000000001, 1), legacyId(1700000000002, 2), legacyId(1700000000003, 3)];
    putLegacy(ctx, own1, "teacher"); putLegacy(ctx, rel, "student"); putLegacy(ctx, own2, "teacher");
    await absorbIrrelevantLegacy(ctx.container, { stateName: name, legacyIds: [own1, rel, own2], ids: [own1, own2] });
    expect(ctx.has(name)).toBe(false);
    await absorbIrrelevantLegacy(ctx.container, { stateName: name, legacyIds: [own1, rel, own2], ids: [own1] });   // a true leading run
    const m = await loadMarker(ctx.container, name);
    expect([isReadBy(m, own1), isReadBy(m, rel), isReadBy(m, own2)]).toEqual([true, false, false]);
  });

  it("CAS retry: the frontier is re-validated against the marker actually being updated", async () => {
    const name = teacherDirectStateName("builder-1", S1);
    let fired = false;
    const ctx = createMemoryContainer(seed(), {
      beforeConditionalUpload(n, api) {
        if (fired || n !== name) return;
        fired = true;
        api.setJson(name, { schemaVersion: 2, legacy: null, sequenced: null });          // the state the retry must see
      }
    });
    const relevant = Array.from({ length: 150 }, (_, i) => legacyId(1800000000000 + i, i));
    relevant.forEach(id => putLegacy(ctx, id, "student"));
    // Under the initial marker 90 unread remain and all fit → the acknowledgement looks safe at first.
    ctx.setJson(name, { schemaVersion: 2, legacy: { boundaryMs: 1800000000000 + 59, seenIdsAtBoundary: [relevant[59]] }, sequenced: null });
    const stream = { stateName: name, streamPrefix: directPrefix(S1), expected: { kind: "direct", studentId: S1 }, include: READER_RELEVANCE.teacherDirect };
    await expect(markStreamRead(ctx.container, { ...stream, throughMessageId: relevant[149], seenIdsAtBoundary: [relevant[149]] })).rejects.toBeInstanceOf(MarkReadError);
    expect(fired).toBe(true);
    expect(ctx.getJson(name)).toEqual({ schemaVersion: 2, legacy: null, sequenced: null });   // nothing written
  });
});
