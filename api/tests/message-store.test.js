import { describe, it, expect } from "vitest";
import {
  isSafeId, directPrefix, announcementPrefix, sequencedMessageId, messagePosition, normalizeMessageBody, clampLimit,
  createMessage, listRecentMessages, messageView, studentDisplayName,
  DIRECT_PREFIX, ANNOUNCEMENT_PREFIX, MAX_BODY_LENGTH, MAX_HISTORY_LIMIT, MAX_CREATE_ATTEMPTS, SEQUENCE_KEY_BASE
} from "../src/lib/message-store.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 5C — the append-only, one-blob-per-message store.

const directDoc = (studentId, text) => (messageId, createdAt) => ({ schemaVersion: 1, messageId, kind: "direct", studentId, senderRole: "teacher", senderId: "t1", senderDisplayName: "المعلم", body: text, createdAt, classIdAtSend: "c1" });
const annDoc = (classId, text) => (messageId, createdAt) => ({ schemaVersion: 1, messageId, kind: "announcement", classId, senderRole: "teacher", senderId: "t1", senderDisplayName: "المعلم", body: text, createdAt });
const seqNow = (start = 1700000000000) => { let t = start; return () => (t += 1000); };

describe("safe prefixes", () => {
  it("direct/announcement prefixes are narrow and reject unsafe ids (never rewritten)", () => {
    expect(directPrefix("u-1")).toBe(DIRECT_PREFIX + "u-1/");
    expect(announcementPrefix("c_1")).toBe(ANNOUNCEMENT_PREFIX + "c_1/");
    for (const bad of ["", "../x", "a/b", "a%2Fb", "a.b", " a", "x".repeat(129), null, 7]) {
      expect(isSafeId(bad), String(bad)).toBe(false);
      expect(() => directPrefix(bad)).toThrow();
      expect(() => announcementPrefix(bad)).toThrow();
    }
  });
});

describe("server-generated ids (publication positions)", () => {
  it("<13-digit order key>-<16 hex>: key = SEQUENCE_KEY_BASE + position; order == position order; above every legacy id", () => {
    const p = directPrefix("s1");
    const [a, b, c] = [1, 2, 10].map(n => sequencedMessageId(p, n));
    for (const id of [a, b, c]) expect(id).toMatch(/^\d{13}-[a-f0-9]{16}$/);
    expect(a.slice(0, 13)).toBe(String(SEQUENCE_KEY_BASE + 1));
    expect([c, a, b].sort()).toEqual([a, b, c]);
    expect("1799999999999-ffffffffffffffff" < a).toBe(true);                     // legacy ms ids sort first
    expect(sequencedMessageId(p, 1)).toBe(a);                                    // deterministic per (stream, position)
    expect(sequencedMessageId(directPrefix("s2"), 1)).not.toBe(a);               // distinct across streams
    for (const bad of [0, -1, 1.5, NaN]) expect(() => sequencedMessageId(p, bad)).toThrow();
  });
  it("messagePosition: canonical sequenced id → position; legacy id → 0; forged / other-stream / malformed → -1", () => {
    const p = directPrefix("s1");
    expect(messagePosition(sequencedMessageId(p, 7), p)).toBe(7);
    expect(messagePosition("1700000000000-aaaaaaaaaaaaaaaa", p)).toBe(0);
    expect(messagePosition(sequencedMessageId(directPrefix("s2"), 7), p)).toBe(-1);   // another stream's position
    expect(messagePosition(String(SEQUENCE_KEY_BASE + 7) + "-aaaaaaaaaaaaaaaa", p)).toBe(-1);
    expect(messagePosition(String(SEQUENCE_KEY_BASE) + "-aaaaaaaaaaaaaaaa", p)).toBe(-1);
    expect(messagePosition("x", p)).toBe(-1);
  });
});

describe("body contract", () => {
  it("trims, keeps internal newlines, strips control chars, rejects empty / non-string / oversized", () => {
    expect(normalizeMessageBody("  مرحبا\r\nكيف الحال؟  ")).toEqual({ ok: true, body: "مرحبا\nكيف الحال؟" });
    expect(normalizeMessageBody("a\u0000b\u0007c\td").body).toBe("abc\td");
    expect(normalizeMessageBody("<b>x</b>").body).toBe("<b>x</b>");       // stored verbatim, rendered as text only
    for (const bad of ["", "   \n  ", null, undefined, 5, { body: "x" }]) expect(normalizeMessageBody(bad).ok).toBe(false);
    expect(normalizeMessageBody("x".repeat(MAX_BODY_LENGTH)).ok).toBe(true);
    expect(normalizeMessageBody("x".repeat(MAX_BODY_LENGTH + 1)).ok).toBe(false);
  });
  it("limit is hard-capped", () => {
    expect(clampLimit(undefined, 100)).toBe(100);
    expect(clampLimit("abc", 50)).toBe(50);
    expect(clampLimit(10, 100)).toBe(10);
    expect(clampLimit(1e9, 100)).toBe(MAX_HISTORY_LIMIT);
  });
});

describe("create-only writes", () => {
  it("writes one immutable blob per message under the requested prefix", async () => {
    const ctx = createMemoryContainer({});
    const doc = await createMessage(ctx.container, directPrefix("s1"), directDoc("s1", "hello"), { now: seqNow() });
    expect(ctx.names(DIRECT_PREFIX)).toEqual([directPrefix("s1") + doc.messageId + ".json"]);
    expect(ctx.getJson(directPrefix("s1") + doc.messageId + ".json")).toEqual(doc);
  });
  it("rapid sends within the SAME millisecond keep send order (consecutive publication positions)", async () => {
    const ctx = createMemoryContainer({});
    for (const t of ["a", "b", "c", "d", "e"]) await createMessage(ctx.container, directPrefix("s1"), directDoc("s1", t), { now: () => 1900000000000 });
    const r = await listRecentMessages(ctx.container, directPrefix("s1"), { kind: "direct", studentId: "s1" }, 100);
    expect(r.messages.map(m => m.body)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("a position already published (stale listing) is never overwritten: the create conflicts and the NEXT position is used", async () => {
    const ctx = createMemoryContainer({});
    const prefix = directPrefix("s1");
    const first = sequencedMessageId(prefix, 1);
    const original = { schemaVersion: 1, messageId: first, kind: "direct", studentId: "s1", senderRole: "student", senderId: "s1", senderDisplayName: "S", body: "ORIGINAL", createdAt: "2023-01-01T00:00:00.000Z" };
    ctx.setJson(prefix + first + ".json", original);
    const doc = await createMessage(ctx.container, prefix, directDoc("s1", "NEW"), { listBlobNames: async () => [] });   // listing missed position 1
    expect(doc.messageId).toBe(sequencedMessageId(prefix, 2));
    expect(ctx.getJson(prefix + first + ".json")).toEqual(original);              // never overwritten
    expect(ctx.names(prefix).length).toBe(2);
  });
  it("gives up (throws) after bounded conflicts and never overwrites — nothing half-published", async () => {
    const ctx = createMemoryContainer({});
    const prefix = directPrefix("s1");
    for (let n = 1; n <= MAX_CREATE_ATTEMPTS; n++) ctx.setJson(prefix + sequencedMessageId(prefix, n) + ".json", { keep: n });
    await expect(createMessage(ctx.container, prefix, directDoc("s1", "x"), { listBlobNames: async () => [] })).rejects.toThrow();
    expect(ctx.names(prefix).length).toBe(MAX_CREATE_ATTEMPTS);
    for (let n = 1; n <= MAX_CREATE_ATTEMPTS; n++) expect(ctx.getJson(prefix + sequencedMessageId(prefix, n) + ".json")).toEqual({ keep: n });
  });
  it("a non-conflict storage error propagates (not retried as a collision)", async () => {
    const boom = Object.assign(new Error("down"), { statusCode: 500 });
    await expect(createMessage({}, directPrefix("s1"), directDoc("s1", "x"), { listBlobNames: async () => [], uploadJsonConditional: async () => { throw boom; } })).rejects.toBe(boom);
  });
});

describe("bounded, prefix-scoped reads", () => {
  it("returns the most recent `limit` messages oldest→newest and downloads ONLY that page", async () => {
    const ctx = createMemoryContainer({});
    const now = seqNow();
    for (let i = 0; i < 8; i++) await createMessage(ctx.container, directPrefix("s1"), directDoc("s1", "m" + i), { now });
    const downloaded = [];
    const r = await listRecentMessages(ctx.container, directPrefix("s1"), { kind: "direct", studentId: "s1" }, 3, {
      downloadManyJson: async (c, names) => { downloaded.push(...names); return Promise.all(names.map(async n => ctx.getJson(n))); }
    });
    expect(r.messages.map(m => m.body)).toEqual(["m5", "m6", "m7"]);
    expect(r.hasMore).toBe(true);
    expect(downloaded.length).toBe(3);
  });
  it("direct history comes only from the requested student's prefix; announcements only from the requested class", async () => {
    const ctx = createMemoryContainer({});
    const now = seqNow();
    await createMessage(ctx.container, directPrefix("s1"), directDoc("s1", "for s1"), { now });
    await createMessage(ctx.container, directPrefix("s10"), directDoc("s10", "for s10"), { now });   // prefix-sibling
    await createMessage(ctx.container, announcementPrefix("c1"), annDoc("c1", "ann c1"), { now });
    await createMessage(ctx.container, announcementPrefix("c2"), annDoc("c2", "ann c2"), { now });
    expect((await listRecentMessages(ctx.container, directPrefix("s1"), { kind: "direct", studentId: "s1" }, 100)).messages.map(m => m.body)).toEqual(["for s1"]);
    expect((await listRecentMessages(ctx.container, announcementPrefix("c1"), { kind: "announcement", classId: "c1" }, 50)).messages.map(m => m.body)).toEqual(["ann c1"]);
  });
  it("malformed / mismatched stored documents are skipped (fail safe), valid ones still load", async () => {
    const ctx = createMemoryContainer({});
    const now = seqNow();
    const good = await createMessage(ctx.container, directPrefix("s1"), directDoc("s1", "good"), { now });
    const p = directPrefix("s1");
    ctx.setJson(p + "1700000009000-cccccccccccccccc.json", { kind: "direct", messageId: "1700000009000-cccccccccccccccc", studentId: "OTHER", senderRole: "teacher", body: "wrong owner" });
    ctx.setJson(p + "1700000009001-dddddddddddddddd.json", { kind: "direct", messageId: "1700000009001-dddddddddddddddd", studentId: "s1", senderRole: "admin", body: "bad role" });
    ctx.setJson(p + "1700000009002-eeeeeeeeeeeeeeee.json", { kind: "direct", messageId: "mismatch", studentId: "s1", senderRole: "teacher", body: "id mismatch" });
    ctx.setJson(p + "not-a-message-id.json", { kind: "direct", studentId: "s1", senderRole: "teacher", body: "bad name" });
    ctx.setJson(p + "1700000009003-ffffffffffffffff.json", "just a string");
    const r = await listRecentMessages(ctx.container, p, { kind: "direct", studentId: "s1" }, 100);
    expect(r.messages.map(m => m.messageId)).toEqual([good.messageId]);
  });
});

describe("views", () => {
  it("expose only safe fields (no senderId / classIdAtSend / storage paths)", () => {
    const doc = directDoc("s1", "hi")("1700000000000-aaaaaaaaaaaaaaaa", "2023-11-14T22:13:20.000Z");
    const v = messageView(doc);
    expect(Object.keys(v).sort()).toEqual(["body", "createdAt", "kind", "messageId", "senderDisplayName", "senderRole"]);
    expect(JSON.stringify(v)).not.toContain("platform/");
    expect(messageView(doc, { includeStudentId: true }).studentId).toBe("s1");
  });
  it("student display name derives from the stored document", () => {
    expect(studentDisplayName({ displayName: "  سارة أحمد " })).toBe("سارة أحمد");
    expect(studentDisplayName({ firstName: "سارة", familyName: "أحمد" })).toBe("سارة أحمد");
  });
});
