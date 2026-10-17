import { describe, it, expect, beforeEach } from "vitest";
import { handler as teacherMessages } from "../src/functions/messages.js";
import { handler as studentMessages } from "../src/functions/student-messages.js";
import { directPrefix, announcementPrefix, sequencedMessageId, normalizeMessageBody } from "../src/lib/message-store.js";
import { teacherDirectStateName, studentDirectStateName, isReadBy, normalizeMarker } from "../src/lib/message-read-state.js";
import { bucketName } from "../src/lib/message-rate-limit.js";
import { sendKeyName } from "../src/lib/message-send-key.js";
import { StorageConflictError } from "../src/lib/platform-storage.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Messages M.3a — correctness follow-ups of the independent audit of the M.1 head:
//   #3  no relevant message is marked read without having been displayed (sequenced unread frontier) + older history
//   #4  an ambiguous publish (response lost after the commit) never publishes a second copy
//   #5  a stale idempotency claim whose message was published is replayed, never re-published
//   #6  exhausted compare-and-set retries are a retryable 503; a corrupt limiter / claim blob is not a permanent 500
// Defect cases were run against 57b9b838 first (see the PR); the rest pin the new contract.

const S1 = "11111111-1111-1111-1111-111111111111";
const C1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const T1 = "teacher-1";
const student = (userId, over = {}) => ({ schemaVersion: 3, role: "student", userId, displayName: "سارة", classId: C1, active: true, archived: false, authVersion: 1, identityNumber: "987654321", ...over });
const seed = (over = {}) => ({
  ["platform/users/" + S1 + ".json"]: student(S1),
  ["platform/classes/" + C1 + ".json"]: { classId: C1, name: "الصف الأول", active: true, ownerId: T1, studentIds: [S1] },
  ...over
});

let clock;
const openLimits = { reserveMessageSend: async () => ({ allowed: true, retryAfterSeconds: 0, scope: "" }) };
const TEACHER = (ctx, extra = {}) => ({
  requireBuilderAuth: () => ({ ok: true, user: { sub: T1, am: "multi-user" } }),
  container: ctx.container,
  resolveTeacherDisplayName: async () => "أ. أحمد",
  recordAuditEvent: async () => {},
  notifyStudentOfNewMessage: async () => {},
  now: () => clock,
  ...extra
});
const STUDENT = (ctx, extra = {}) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }), now: () => clock, ...extra });
const tGet = (deps, q) => teacherMessages({ method: "GET", url: "https://x/api/messages" + q, headers: { get: () => null } }, deps);
const tPost = (deps, body) => teacherMessages({ method: "POST", url: "https://x/api/messages", headers: { get: () => null }, json: async () => body }, deps);
const sGet = (deps, q = "") => studentMessages({ method: "GET", url: "https://x/api/student-messages" + q, headers: { get: () => null } }, deps);
const sPost = (deps, body) => studentMessages({ method: "POST", url: "https://x/api/student-messages", headers: { get: () => null }, json: async () => body }, deps);

const DP = directPrefix(S1);
const idAt = p => sequencedMessageId(DP, p);
/** Writes stream positions from..to directly (fast seeding); `role(p)` picks the sender of each position. */
function putDirect(ctx, from, to, role = () => "student") {
  for (let p = from; p <= to; p++) {
    const r = role(p);
    ctx.setJson(DP + idAt(p) + ".json", { schemaVersion: 1, messageId: idAt(p), kind: "direct", studentId: S1, senderRole: r, senderId: r === "student" ? S1 : T1, senderDisplayName: r === "student" ? "سارة" : "أ. أحمد", body: "رسالة " + p, createdAt: new Date(clock + p * 1000).toISOString(), classIdAtSend: C1 });
  }
}
const positions = msgs => msgs.map(m => Number(m.messageId.slice(0, 13)) - 9000000000000);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const conflictError = () => { const e = new Error("BlobAlreadyExists"); e.statusCode = 409; e.code = "BlobAlreadyExists"; return e; };

beforeEach(() => { clock = Date.parse("2026-10-17T08:00:00.000Z"); });

describe("#6 — retryable conflicts and corrupt control blobs", () => {
  it("mark-read whose compare-and-set retries are exhausted → 503 BUSY + Retry-After, not a 500", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, 1, 1);
    const r = await tPost(TEACHER(ctx, { mutateJsonWithRetry: async () => { throw new StorageConflictError(); } }), { action: "markDirectRead", studentId: S1, throughMessageId: idAt(1), seenIdsAtBoundary: [idAt(1)] });
    expect(r.status).toBe(503);
    expect(r.jsonBody.code).toBe("BUSY");
    expect(r.headers["Retry-After"]).toBe("1");
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });
  it("a student send whose limiter retries are exhausted → 503 BUSY; nothing published", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await sPost(STUDENT(ctx, { reserveMessageSend: async () => { throw new StorageConflictError(); } }), { action: "sendDirect", body: "مرحبا" });
    expect(r.status).toBe(503);
    expect(r.jsonBody.code).toBe("BUSY");
    expect(ctx.names(DP)).toHaveLength(0);
  });
  it("a corrupt rate-limit bucket is reset (one fresh bucket), never a permanent 500 for that sender", async () => {
    const ctx = createMemoryContainer(seed());
    ctx.store.set(bucketName("student", S1), { content: Buffer.from("{corrupt"), etag: "b1", contentType: "" });
    const r = await sPost(STUDENT(ctx), { action: "sendDirect", body: "مرحبا" });
    expect(r.status).toBe(200);
    expect(ctx.getJson(bucketName("student", S1)).schemaVersion).toBe(1);        // valid again
    expect((await sPost(STUDENT(ctx), { action: "sendDirect", body: "ثانية" })).status).toBe(200);
  });
  it("a corrupt idempotency claim is replaced: the send publishes once", async () => {
    const ctx = createMemoryContainer(seed());
    const key = { role: "student", senderId: S1, streamPrefix: DP, clientMessageId: "corrupt-key-001" };
    ctx.store.set(sendKeyName(key), { content: Buffer.from("not json"), etag: "k1", contentType: "" });
    const r = await sPost(STUDENT(ctx), { action: "sendDirect", body: "مرحبا", clientMessageId: "corrupt-key-001" });
    expect(r.status).toBe(200);
    expect(ctx.names(DP)).toHaveLength(1);
    expect(ctx.getJson(sendKeyName(key)).state).toBe("sent");
  });
  it("409 SEND_IN_PROGRESS tells the client when to retry (Retry-After)", async () => {
    const ctx = createMemoryContainer(seed());
    const key = { role: "student", senderId: S1, streamPrefix: DP, clientMessageId: "inflight-key-02" };
    ctx.setJson(sendKeyName(key), { schemaVersion: 1, state: "pending", claimedAt: new Date(clock - 1000).toISOString() });
    const r = await sPost(STUDENT(ctx), { action: "sendDirect", body: "مرحبا", clientMessageId: "inflight-key-02" });
    expect(r.status).toBe(409);
    expect(Number(r.headers["Retry-After"])).toBeGreaterThan(0);
  });
  it("text: tag characters, fillers, soft hyphens and invisible separators are removed; U+2028/2029 become new lines", () => {
    expect(normalizeMessageBody("مر\u00ADحبا\u{E0041}\u3164").body).toBe("مرحبا");
    expect(normalizeMessageBody("سطر\u2028ثانٍ\u2029ثالث").body).toBe("سطر\nثانٍ\nثالث");
    for (const only of ["\u3164\u3164", "\u2800", "\u115F\u1160", "\uFFA0", "\u{E0020}\u{E007F}", "\u180E", "\uFFF9"]) expect(normalizeMessageBody(only).ok).toBe(false);
    expect(normalizeMessageBody("می\u200Cخواهم").body).toBe("می\u200Cخواهم");              // ZWNJ still kept
  });
});

describe("#4 / #5 — publication never duplicates a message whose commit succeeded", () => {
  it("the storage SDK retried a committed create and got 409: the request returns ITS message, no second copy", async () => {
    const ctx = createMemoryContainer(seed());
    const real = (await import("../src/lib/platform-storage.js")).uploadJsonConditional;
    let lost = 0;
    const upload = async (c, name, value, etag) => {
      const tag = await real(c, name, value, etag);
      if (name.startsWith(DP) && etag === null && lost++ === 0) throw conflictError();   // committed, then "already exists"
      return tag;
    };
    const r = await sPost(STUDENT(ctx, { ...openLimits, uploadJsonConditional: upload }), { action: "sendDirect", body: "مرة واحدة", clientMessageId: "sdk-retry-key-1" });
    expect(r.status).toBe(200);
    expect(ctx.names(DP)).toHaveLength(1);
    expect(r.jsonBody.message.messageId).toBe(idAt(1));
  });
  it("an ambiguous failure after the commit keeps the claim: an immediate retry waits (409), a later one replays — one message", async () => {
    const ctx = createMemoryContainer(seed());
    const real = (await import("../src/lib/platform-storage.js")).uploadJsonConditional;
    let failed = 0;
    const upload = async (c, name, value, etag) => {
      const tag = await real(c, name, value, etag);
      if (name.startsWith(DP) && failed++ === 0) { const e = new Error("socket hang up"); e.code = "ECONNRESET"; throw e; }
      return tag;
    };
    const body = { action: "sendDirect", body: "مرة واحدة", clientMessageId: "ambiguous-key-1" };
    expect((await sPost(STUDENT(ctx, { ...openLimits, uploadJsonConditional: upload }), body)).status).toBe(500);
    expect(ctx.names(DP)).toHaveLength(1);                                          // it WAS published
    expect((await sPost(STUDENT(ctx, openLimits), body)).status).toBe(409);         // claim kept → retry later
    clock += 60 * 1000;
    const replay = await sPost(STUDENT(ctx, openLimits), body);
    expect(replay.status).toBe(200);
    expect(replay.jsonBody.replay).toBe(true);
    expect(replay.jsonBody.message.messageId).toBe(idAt(1));
    expect(ctx.names(DP)).toHaveLength(1);
  });
  it("a stale claim whose request published but could not record it (finalize failed) is replayed after takeover", async () => {
    const ctx = createMemoryContainer(seed());
    const real = (await import("../src/lib/platform-storage.js")).uploadJsonConditional;
    const upload = async (c, name, value, etag) => {
      if (name.startsWith("platform/messages/send-keys/") && value && value.state === "sent") throw new Error("finalize lost");
      return real(c, name, value, etag);
    };
    const body = { action: "sendDirect", body: "مرة واحدة", clientMessageId: "finalize-key-01" };
    expect((await sPost(STUDENT(ctx, { ...openLimits, uploadJsonConditional: upload }), body)).status).toBe(200);
    clock += 60 * 1000;                                                             // the claim is still "pending" and stale
    const again = await sPost(STUDENT(ctx, openLimits), body);
    expect(again.status).toBe(200);
    expect(again.jsonBody.replay).toBe(true);
    expect(ctx.names(DP)).toHaveLength(1);
  });
  it("the publication stamp is storage-only: never part of a message view", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await sPost(STUDENT(ctx), { action: "sendDirect", body: "مرحبا", clientMessageId: "view-key-0001" });
    expect(Object.keys(r.jsonBody.message).sort()).toEqual(["body", "createdAt", "kind", "messageId", "senderDisplayName", "senderRole"]);
    const t = await tGet(TEACHER(ctx), "?studentId=" + S1);
    expect(JSON.stringify(t.jsonBody)).not.toMatch(/publish|sendKey|nonce/i);
  });
});

describe("#3 — every relevant message is displayed before it can be marked read", () => {
  it("130 unread student replies: the page shows the OLDEST 100 unread (not the newest 100) and says newer ones follow", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, 1, 130);
    const r = await tGet(TEACHER(ctx), "?studentId=" + S1);
    expect(positions(r.jsonBody.messages)).toEqual(range(1, 100));
    expect(r.jsonBody.hasNewer).toBe(true);
  });
  it("an acknowledgement that would cover an unread reply no page showed is refused (400, no write)", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, 1, 130);
    const r = await tPost(TEACHER(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: idAt(130), seenIdsAtBoundary: [idAt(130)] });
    expect(r.status).toBe(400);
    expect(ctx.has(teacherDirectStateName(T1, S1))).toBe(false);
  });
  it("reading page by page: ack the shown frontier, the next read shows the rest; nothing is skipped", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, 1, 130);
    expect((await tPost(TEACHER(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: idAt(100), seenIdsAtBoundary: [idAt(100)] })).status).toBe(200);
    const next = await tGet(TEACHER(ctx), "?studentId=" + S1);
    expect(positions(next.jsonBody.messages)).toEqual(range(31, 130));
    expect(next.jsonBody.hasNewer).toBe(false);
    const done = await tPost(TEACHER(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: idAt(130), seenIdsAtBoundary: [idAt(130)] });
    expect(done.status).toBe(200);
    expect(done.jsonBody.unread).toBe(0);
  });
  it("the reader's own messages never spend the frontier: 150 own + 1 reply → the reply is shown and can be acknowledged", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, 1, 151, p => (p === 151 ? "student" : "teacher"));
    const r = await tGet(TEACHER(ctx), "?studentId=" + S1);
    expect(positions(r.jsonBody.messages).slice(-1)).toEqual([151]);
    expect(r.jsonBody.hasNewer).toBe(false);
    expect((await tPost(TEACHER(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: idAt(151), seenIdsAtBoundary: [idAt(151)] })).status).toBe(200);
  });
  it("the student side follows the same rule (teacher messages are the student's unread)", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, 1, 120, () => "teacher");
    const r = await sGet(STUDENT(ctx));
    expect(positions(r.jsonBody.direct)).toEqual(range(1, 100));
    expect(r.jsonBody.directHasNewer).toBe(true);
    const bad = await sPost(STUDENT(ctx), { action: "markRead", stream: "direct", throughMessageId: idAt(120), seenIdsAtBoundary: [idAt(120)] });
    expect(bad.status).toBe(400);
    expect(ctx.has(studentDirectStateName(S1))).toBe(false);
  });
  it("a normal thread (few unread) is unchanged: the newest page, nothing hidden", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, 1, 150, p => (p % 2 ? "teacher" : "student"));
    await tPost(TEACHER(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: idAt(100), seenIdsAtBoundary: [idAt(100)] }).catch(() => {});
    const marker = normalizeMarker(ctx.getJson(teacherDirectStateName(T1, S1)));
    expect(isReadBy(marker, idAt(100))).toBe(true);
    const r = await tGet(TEACHER(ctx), "?studentId=" + S1);
    expect(positions(r.jsonBody.messages)).toEqual(range(51, 150));
    expect(r.jsonBody.hasNewer).toBe(false);
  });
});

describe("#3 — older history (before cursor)", () => {
  it("teacher: the default page has hasMore; ?before=<oldest shown> returns the previous page; the first page has hasMore=false", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, 1, 150, () => "teacher");
    const first = await tGet(TEACHER(ctx), "?studentId=" + S1);
    expect(positions(first.jsonBody.messages)).toEqual(range(51, 150));
    expect(first.jsonBody.hasMore).toBe(true);
    const older = await tGet(TEACHER(ctx), "?studentId=" + S1 + "&before=" + idAt(51));
    expect(positions(older.jsonBody.messages)).toEqual(range(1, 50));
    expect(older.jsonBody.hasMore).toBe(false);
    const limited = await tGet(TEACHER(ctx), "?studentId=" + S1 + "&before=" + idAt(51) + "&limit=20");
    expect(positions(limited.jsonBody.messages)).toEqual(range(31, 50));
    expect(limited.jsonBody.hasMore).toBe(true);
  });
  it("announcements page the same way; a malformed cursor is a 400", async () => {
    const ctx = createMemoryContainer(seed());
    const AP = announcementPrefix(C1);
    for (let p = 1; p <= 60; p++) {
      const id = sequencedMessageId(AP, p);
      ctx.setJson(AP + id + ".json", { schemaVersion: 1, messageId: id, kind: "announcement", classId: C1, senderRole: "teacher", senderId: T1, senderDisplayName: "أ. أحمد", body: "إعلان " + p, createdAt: new Date(clock + p).toISOString() });
    }
    const first = await tGet(TEACHER(ctx), "?classId=" + C1 + "&kind=announcements");
    expect(first.jsonBody.messages).toHaveLength(50);
    const older = await tGet(TEACHER(ctx), "?classId=" + C1 + "&kind=announcements&before=" + sequencedMessageId(AP, 11));
    expect(older.jsonBody.messages.map(m => m.body)).toEqual(range(1, 10).map(p => "إعلان " + p));
    expect((await tGet(TEACHER(ctx), "?studentId=" + S1 + "&before=../x")).status).toBe(400);
  });
  it("student: ?stream=direct&before=… returns that stream's older page only; the main read reports directHasMore", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, 1, 130, () => "student");
    const main = await sGet(STUDENT(ctx));
    expect(positions(main.jsonBody.direct)).toEqual(range(31, 130));
    expect(main.jsonBody.directHasMore).toBe(true);
    const older = await sGet(STUDENT(ctx), "?stream=direct&before=" + idAt(31));
    expect(positions(older.jsonBody.messages)).toEqual(range(1, 30));
    expect(older.jsonBody.hasMore).toBe(false);
    expect(older.jsonBody.announcements).toBeUndefined();
    expect((await sGet(STUDENT(ctx), "?stream=other&before=" + idAt(31))).status).toBe(400);
  });
  it("an older page never marks anything and never shows an unread reply hidden by the frontier", async () => {
    const ctx = createMemoryContainer(seed());
    putDirect(ctx, 1, 130);
    const older = await tGet(TEACHER(ctx), "?studentId=" + S1 + "&before=" + idAt(130));
    expect(Math.max(...positions(older.jsonBody.messages))).toBeLessThanOrEqual(100);   // 101..129 are beyond the frontier
    expect(ctx.has(teacherDirectStateName(T1, S1))).toBe(false);
  });
});
