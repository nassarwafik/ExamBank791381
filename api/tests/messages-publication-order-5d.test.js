import { describe, it, expect } from "vitest";
import { handler as teacher } from "../src/functions/messages.js";
import { handler as studentApi } from "../src/functions/student-messages.js";
import { directPrefix, announcementPrefix, createMessage, listRecentMessages, sequencedMessageId } from "../src/lib/message-store.js";
import { uploadJsonConditional, listBlobNames } from "../src/lib/platform-storage.js";
import { READ_STATE_PREFIX, teacherDirectStateName } from "../src/lib/message-read-state.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 5D third review BLOCKER — OUT-OF-ORDER PUBLICATION. A message whose creation started FIRST (so it was
// allocated first) can become visible in storage AFTER a later message. The reader's snapshot then shows only the
// later message; acknowledging it must never cover the earlier-allocated message that was not yet published.
// Deterministic: the first message's create-only upload is held on a promise gate (no timers / sleeps).

const S1 = "11111111-1111-1111-1111-111111111111";
const CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const seed = () => ({
  ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "طالب", classId: CA, active: true, archived: false, authVersion: 1, identityNumber: "123456789" },
  ["platform/classes/" + CA + ".json"]: { classId: CA, name: "أ", active: true, studentIds: [] }
});
const req = (method, url, body) => ({ method, url, headers: { get: () => null }, json: async () => body });
const tGet = (deps, q) => teacher(req("GET", "https://x/api/messages" + q), deps);
const tPost = (deps, body) => teacher(req("POST", "https://x/api/messages", body), deps);
const sGet = (deps, q = "") => studentApi(req("GET", "https://x/api/student-messages" + q), deps);
const sPost = (deps, body) => studentApi(req("POST", "https://x/api/student-messages", body), deps);

/**
 * Storage double that HOLDS the first message upload under `prefix` until released. `now` hands A an earlier
 * clock value than B (A starts first). Everything else goes straight to the real conditional upload.
 */
function delayedFirstPublication(prefix) {
  let release, reached;
  const gate = new Promise(r => { release = r; });
  const heldReached = new Promise(r => { reached = r; });
  let held = false;
  const clock = [1800000001000, 1800000001001];
  const deps = {
    now: () => (clock.length > 1 ? clock.shift() : clock[0]),
    uploadJsonConditional: async (container, name, doc, etag) => {
      if (!held && name.startsWith(prefix) && !name.includes("/read-state/")) {
        held = true;
        reached(name);
        await gate;                                            // A's upload is in flight but not yet visible
      }
      return uploadJsonConditional(container, name, doc, etag);
    }
  };
  return { deps, release: () => release(), heldReached };
}

const teacherDeps = (ctx, extra = {}) => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "builder-1" } }), container: ctx.container, resolveTeacherDisplayName: async () => "أ. أحمد", recordAuditEvent: async () => {}, ...extra });
const studentDeps = (ctx, extra = {}) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student", classId: CA } }), ...extra });

describe("out-of-order publication never lets a read boundary swallow a later-published message", () => {
  it("TEACHER reads STUDENT messages: A delayed, B published first → GET sees B → mark B → A publishes → A unread (1)", async () => {
    const ctx = createMemoryContainer(seed());
    const pub = delayedFirstPublication(directPrefix(S1));
    const sendA = sPost(studentDeps(ctx, pub.deps), { action: "sendDirect", body: "A" });          // allocated first
    await pub.heldReached;
    const b = await sPost(studentDeps(ctx, pub.deps), { action: "sendDirect", body: "B" });        // published first
    expect(b.status).toBe(200);
    const view = await tGet(teacherDeps(ctx), "?studentId=" + S1);
    expect(view.jsonBody.messages.map(m => m.body)).toEqual(["B"]);                              // the snapshot: B only
    const B = view.jsonBody.messages[0].messageId;
    const marked = await tPost(teacherDeps(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: B, seenIdsAtBoundary: [B] });
    expect(marked.jsonBody).toMatchObject({ ok: true, unread: 0 });
    pub.release();
    const a = await sendA;                                                                          // A becomes visible only now
    expect(a.status).toBe(200);
    expect(a.jsonBody.message.messageId > B).toBe(true);                                         // published AFTER B → ordered after B
    const after = await tGet(teacherDeps(ctx), "?studentId=" + S1);
    expect(after.jsonBody.messages.map(m => m.body).sort()).toEqual(["A", "B"]);
    expect((await tGet(teacherDeps(ctx), "?kind=unread-summary")).jsonBody).toMatchObject({ totalUnread: 1 });
    expect((await tGet(teacherDeps(ctx), "?kind=unread-summary&classId=" + CA)).jsonBody.byStudent).toEqual({ [S1]: { unread: 1, capped: false } });
  });

  it("STUDENT reads TEACHER direct messages: same sequence → A stays unread", async () => {
    const ctx = createMemoryContainer(seed());
    const pub = delayedFirstPublication(directPrefix(S1));
    const sendA = tPost(teacherDeps(ctx, pub.deps), { action: "sendDirect", studentId: S1, body: "A" });
    await pub.heldReached;
    expect((await tPost(teacherDeps(ctx, pub.deps), { action: "sendDirect", studentId: S1, body: "B" })).status).toBe(200);
    const view = await sGet(studentDeps(ctx));
    expect(view.jsonBody.direct.map(m => m.body)).toEqual(["B"]);
    const B = view.jsonBody.direct[0].messageId;
    expect((await sPost(studentDeps(ctx), { action: "markRead", stream: "direct", throughMessageId: B, seenIdsAtBoundary: [B] })).jsonBody).toMatchObject({ directUnread: { unread: 0 } });
    pub.release();
    expect((await sendA).status).toBe(200);
    expect((await sGet(studentDeps(ctx), "?view=unread")).jsonBody).toMatchObject({ directUnread: { unread: 1, capped: false }, totalUnread: 1 });
  });

  it("ANNOUNCEMENTS: A delayed, B published first → student marks B → A publishes → A stays unread", async () => {
    const ctx = createMemoryContainer(seed());
    const pub = delayedFirstPublication(announcementPrefix(CA));
    const sendA = tPost(teacherDeps(ctx, pub.deps), { action: "sendAnnouncement", classId: CA, body: "A" });
    await pub.heldReached;
    expect((await tPost(teacherDeps(ctx, pub.deps), { action: "sendAnnouncement", classId: CA, body: "B" })).status).toBe(200);
    const view = await sGet(studentDeps(ctx));
    expect(view.jsonBody.announcements.map(m => m.body)).toEqual(["B"]);
    const B = view.jsonBody.announcements[0].messageId;
    expect((await sPost(studentDeps(ctx), { action: "markRead", stream: "announcements", throughMessageId: B, seenIdsAtBoundary: [B] })).jsonBody).toMatchObject({ announcementUnread: { unread: 0 } });
    pub.release();
    expect((await sendA).status).toBe(200);
    expect((await sGet(studentDeps(ctx), "?view=unread")).jsonBody).toMatchObject({ announcementUnread: { unread: 1, capped: false }, totalUnread: 1 });
  });
});

const doc = (sid, role, text) => (messageId, createdAt) => ({ schemaVersion: 1, messageId, kind: "direct", studentId: sid, senderRole: role, senderId: "x", senderDisplayName: "x", body: text, createdAt, classIdAtSend: CA });
const view = (ctx, sid) => listRecentMessages(ctx.container, directPrefix(sid), { kind: "direct", studentId: sid }, 100);

describe("publication positions: concurrency, listing gaps, forged ids, partial failure", () => {
  it("CONCURRENT publishers from a stale listing race for the SAME position: exactly one wins, the others take the next ones — nothing overwritten", async () => {
    const ctx = createMemoryContainer(seed());
    const prefix = directPrefix(S1);
    const stale = { listBlobNames: async () => [] };                                   // every writer believes the stream is empty
    const sent = await Promise.all(["a", "b", "c"].map(t => createMessage(ctx.container, prefix, doc(S1, "student", t), stale)));
    expect(sent.map(d => d.messageId).sort()).toEqual([1, 2, 3].map(n => sequencedMessageId(prefix, n)));
    expect((await view(ctx, S1)).messages.map(m => m.body).sort()).toEqual(["a", "b", "c"]);
    for (const d of sent) expect(ctx.getJson(prefix + d.messageId + ".json").body).toBe(d.body);   // each blob holds its own writer's body
  });

  it("a listing that misses a position (non-atomic listing) never SHOWS the later one: the snapshot is the contiguous prefix", async () => {
    const ctx = createMemoryContainer(seed());
    const prefix = directPrefix(S1);
    for (const t of ["m1", "m2", "m3"]) await createMessage(ctx.container, prefix, doc(S1, "student", t));
    const missing = sequencedMessageId(prefix, 2);
    const holey = { listBlobNames: async (c, p) => (await listBlobNames(c, p)).filter(n => !n.includes(missing)) };
    expect((await listRecentMessages(ctx.container, prefix, { kind: "direct", studentId: S1 }, 100, holey)).messages.map(m => m.body)).toEqual(["m1"]);
    expect((await view(ctx, S1)).messages.map(m => m.body)).toEqual(["m1", "m2", "m3"]);   // the next full listing shows all
    const r = await tGet(teacherDeps(ctx, holey), "?studentId=" + S1);                   // the API uses the same rule
    expect(r.jsonBody.messages.map(m => m.body)).toEqual(["m1"]);
  });

  it("a blob in the sequenced key range that is NOT the canonical id of its position is ignored everywhere and cannot be acknowledged", async () => {
    const ctx = createMemoryContainer(seed());
    const prefix = directPrefix(S1);
    await createMessage(ctx.container, prefix, doc(S1, "student", "real"));
    const forged = "9000000000005-aaaaaaaaaaaaaaaa";
    ctx.setJson(prefix + forged + ".json", doc(S1, "student", "forged")(forged, ""));
    const other = sequencedMessageId(directPrefix("22222222-2222-2222-2222-222222222222"), 2);   // another stream's position id
    ctx.setJson(prefix + other + ".json", doc(S1, "student", "copied")(other, ""));
    expect((await view(ctx, S1)).messages.map(m => m.body)).toEqual(["real"]);
    expect((await tGet(teacherDeps(ctx), "?kind=unread-summary")).jsonBody.totalUnread).toBe(1);
    for (const id of [forged, other]) {
      expect((await tPost(teacherDeps(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: id, seenIdsAtBoundary: [id] })).status).toBe(400);
    }
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([]);
  });

  it("PARTIAL FAILURE: a failed publication write leaves nothing visible (one write = the commit); a retry publishes normally", async () => {
    const ctx = createMemoryContainer(seed());
    const down = { uploadJsonConditional: async () => { throw Object.assign(new Error("storage down"), { statusCode: 503 }); } };
    expect((await sPost(studentDeps(ctx, down), { action: "sendDirect", body: "lost" })).status).toBe(500);
    expect(ctx.names(directPrefix(S1))).toEqual([]);
    expect((await tGet(teacherDeps(ctx), "?kind=unread-summary")).jsonBody.totalUnread).toBe(0);
    const ok = await sPost(studentDeps(ctx), { action: "sendDirect", body: "retry" });
    expect(ok.jsonBody.message.messageId).toBe(sequencedMessageId(directPrefix(S1), 1));
    expect((await tGet(teacherDeps(ctx), "?kind=unread-summary")).jsonBody.totalUnread).toBe(1);
  });
});

describe("legacy (Phase 5C) messages — backward compatible, fail-safe", () => {
  const legacy = (ms, hex) => String(ms) + "-" + hex.repeat(16).slice(0, 16);
  const putLegacy = (ctx, id, role, text) => ctx.setJson(directPrefix(S1) + id + ".json", doc(S1, role, text)(id, "2026-01-01T00:00:00.000Z"));

  it("legacy history stays visible and UNREAD until acknowledged; new messages order after it", async () => {
    const ctx = createMemoryContainer(seed());
    putLegacy(ctx, legacy(1700000000001, "a"), "student", "old1");
    putLegacy(ctx, legacy(1700000000002, "b"), "student", "old2");
    expect((await tGet(teacherDeps(ctx), "?kind=unread-summary")).jsonBody.totalUnread).toBe(2);   // nothing silently read
    await sPost(studentDeps(ctx), { action: "sendDirect", body: "new" });
    const r = await tGet(teacherDeps(ctx), "?studentId=" + S1);
    expect(r.jsonBody.messages.map(m => m.body)).toEqual(["old1", "old2", "new"]);
    expect((await tGet(teacherDeps(ctx), "?kind=unread-summary")).jsonBody.totalUnread).toBe(3);
  });

  it("a legacy acknowledgement keeps the millisecond model for legacy ids and never covers a sequenced message", async () => {
    const ctx = createMemoryContainer(seed());
    const o1 = legacy(1700000000001, "a"), o2 = legacy(1700000000002, "b");
    putLegacy(ctx, o1, "student", "old1"); putLegacy(ctx, o2, "student", "old2");
    await sPost(studentDeps(ctx), { action: "sendDirect", body: "new" });
    const r = await tPost(teacherDeps(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: o1, seenIdsAtBoundary: [o1] });
    expect(r.jsonBody).toMatchObject({ unread: 2 });                                              // old2 + new
    const latest = (await tGet(teacherDeps(ctx), "?studentId=" + S1)).jsonBody.messages.at(-1).messageId;
    expect((await tPost(teacherDeps(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: latest, seenIdsAtBoundary: [latest] })).jsonBody).toMatchObject({ unread: 0 });
    expect(ctx.getJson(teacherDirectStateName("builder-1", S1)).seenIdsAtBoundary).toEqual([latest]);
  });

  it("archived student's legacy + sequenced history stays readable and markable", async () => {
    const ctx = createMemoryContainer(seed());
    putLegacy(ctx, legacy(1700000000001, "a"), "student", "old1");
    await sPost(studentDeps(ctx), { action: "sendDirect", body: "new" });
    const u = ctx.getJson("platform/users/" + S1 + ".json");
    ctx.setJson("platform/users/" + S1 + ".json", { ...u, active: false, archived: true });
    const r = await tGet(teacherDeps(ctx), "?studentId=" + S1);
    expect(r.jsonBody.messages.map(m => m.body)).toEqual(["old1", "new"]);
    const X = r.jsonBody.messages[1].messageId;
    expect((await tPost(teacherDeps(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: X, seenIdsAtBoundary: [X] })).jsonBody).toMatchObject({ unread: 0 });
  });
});
