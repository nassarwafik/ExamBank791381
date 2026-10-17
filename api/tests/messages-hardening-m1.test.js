import { describe, it, expect, beforeEach } from "vitest";
import { handler as teacherMessages } from "../src/functions/messages.js";
import { handler as studentMessages } from "../src/functions/student-messages.js";
import { directPrefix, announcementPrefix, sequencedMessageId, normalizeMessageBody, MAX_BODY_LENGTH } from "../src/lib/message-store.js";
import { teacherDirectStateName, studentDirectStateName, isReadBy, normalizeMarker } from "../src/lib/message-read-state.js";
import { evaluateSendBucket, SEND_LIMITS } from "../src/lib/message-rate-limit.js";
import { sendKeyName } from "../src/lib/message-send-key.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Messages hardening (M.1). Defect cases were reproduced against the baseline (see the PR); the rest pin the new contract.

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const S3 = "33333333-3333-3333-3333-333333333333";
const C1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const T1 = "teacher-1";
const student = (userId, over = {}) => ({ schemaVersion: 3, role: "student", userId, displayName: "الطالب " + userId.slice(0, 1), classId: C1, active: true, archived: false, authVersion: 1, identityNumber: "987654321", ...over });
const seed = (over = {}) => ({
  ["platform/users/" + S1 + ".json"]: student(S1),
  ["platform/users/" + S2 + ".json"]: student(S2),
  ["platform/users/" + S3 + ".json"]: student(S3),
  ["platform/classes/" + C1 + ".json"]: { classId: C1, name: "الصف الأول", active: true, ownerId: T1, studentIds: [S1, S2, S3] },
  ...over
});

let audits, pushes, clock;
const TEACHER = (ctx, extra = {}) => ({
  requireBuilderAuth: () => ({ ok: true, user: { sub: T1, am: "multi-user" } }),
  container: ctx.container,
  resolveTeacherDisplayName: async () => "أ. أحمد",
  recordAuditEvent: async (_c, e) => { audits.push(e); },
  notifyStudentOfNewMessage: async (_c, sid) => { pushes.push(sid); },
  now: () => clock,
  ...extra
});
const STUDENT = (ctx, sub = S1, extra = {}) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub, sv: 1, role: "student" } }), now: () => clock, ...extra });
const tGet = (deps, q) => teacherMessages({ method: "GET", url: "https://x/api/messages" + q, headers: { get: () => null } }, deps);
const tPost = (deps, body) => teacherMessages({ method: "POST", url: "https://x/api/messages", headers: { get: () => null }, json: async () => body }, deps);
const sGet = (deps, q = "") => studentMessages({ method: "GET", url: "https://x/api/student-messages" + q, headers: { get: () => null } }, deps);
const sPost = (deps, body) => studentMessages({ method: "POST", url: "https://x/api/student-messages", headers: { get: () => null }, json: async () => body }, deps);

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
  return { by, reset: () => counts.clear() };
}
const openLimits = { reserveMessageSend: async () => ({ allowed: true, retryAfterSeconds: 0, scope: "" }) };
const messageNames = (ctx, sid) => ctx.names(directPrefix(sid));

beforeEach(() => { audits = []; pushes = []; clock = Date.parse("2026-10-17T08:00:00.000Z"); });

describe("H2 — the reader's own messages are not re-downloaded by every unread count", () => {
  it("a student who never replies: the teacher badge downloads the teacher's own messages ONCE, then never again", async () => {
    const ctx = createMemoryContainer(seed());
    for (let i = 0; i < 12; i++) expect((await tPost(TEACHER(ctx, openLimits), { action: "sendDirect", studentId: S1, body: "ملاحظة " + i })).status).toBe(200);
    const dl = countingDownloads(ctx);
    const first = await tGet(TEACHER(ctx), "?kind=unread-summary&classId=" + C1);
    expect(first.jsonBody.totalUnread).toBe(0);
    expect(dl.by(directPrefix(S1))).toBe(12);                     // classified once…
    dl.reset();
    const second = await tGet(TEACHER(ctx), "?kind=unread-summary&classId=" + C1);
    expect(second.jsonBody.totalUnread).toBe(0);
    expect(dl.by(directPrefix(S1))).toBe(0);                      // …and absorbed: no more downloads
    const marker = normalizeMarker(ctx.getJson(teacherDirectStateName(T1, S1)));
    expect(isReadBy(marker, sequencedMessageId(directPrefix(S1), 12))).toBe(true);
  });
  it("absorption never covers an unread STUDENT message: it stops at the first one (the count is unchanged)", async () => {
    const ctx = createMemoryContainer(seed());
    await tPost(TEACHER(ctx, openLimits), { action: "sendDirect", studentId: S1, body: "سؤال" });                  // position 1 (teacher)
    expect((await sPost(STUDENT(ctx, S1, openLimits), { action: "sendDirect", body: "جواب" })).status).toBe(200);  // position 2 (student, unread)
    await tPost(TEACHER(ctx, openLimits), { action: "sendDirect", studentId: S1, body: "تعقيب" });                // position 3 (teacher)
    for (let i = 0; i < 2; i++) {
      const r = await tGet(TEACHER(ctx), "?kind=unread-summary&classId=" + C1);
      expect(r.jsonBody.byStudent[S1]).toEqual({ unread: 1, capped: false });
    }
    const marker = normalizeMarker(ctx.getJson(teacherDirectStateName(T1, S1)));
    expect(isReadBy(marker, sequencedMessageId(directPrefix(S1), 1))).toBe(true);    // the teacher's leading message
    expect(isReadBy(marker, sequencedMessageId(directPrefix(S1), 2))).toBe(false);   // the student's stays unread
    expect(isReadBy(marker, sequencedMessageId(directPrefix(S1), 3))).toBe(false);   // nothing past it is covered
  });
  it("absorption stops at a missing position (a message the listing has not shown yet is never covered)", async () => {
    const ctx = createMemoryContainer(seed());
    for (let i = 0; i < 3; i++) await tPost(TEACHER(ctx, openLimits), { action: "sendDirect", studentId: S1, body: "م" + i });
    ctx.store.delete(directPrefix(S1) + sequencedMessageId(directPrefix(S1), 2) + ".json");   // position 2 not visible
    await tGet(TEACHER(ctx), "?kind=unread-summary&classId=" + C1);
    const marker = normalizeMarker(ctx.getJson(teacherDirectStateName(T1, S1)));
    expect(isReadBy(marker, sequencedMessageId(directPrefix(S1), 1))).toBe(true);
    expect(isReadBy(marker, sequencedMessageId(directPrefix(S1), 2))).toBe(false);
    expect(isReadBy(marker, sequencedMessageId(directPrefix(S1), 3))).toBe(false);
  });
  it("the student's badge poll absorbs the student's own replies; the notification view stays read-only", async () => {
    const ctx = createMemoryContainer(seed());
    for (let i = 0; i < 5; i++) await sPost(STUDENT(ctx, S1, openLimits), { action: "sendDirect", body: "رد " + i });
    const before = JSON.stringify(ctx.getJson(studentDirectStateName(S1)));
    expect((await sGet(STUDENT(ctx), "?view=notifications")).status).toBe(200);
    expect(JSON.stringify(ctx.getJson(studentDirectStateName(S1)))).toBe(before);     // notifications: no write
    const r = await sGet(STUDENT(ctx), "?view=unread");
    expect(r.jsonBody.directUnread).toEqual({ unread: 0, capped: false });
    const marker = normalizeMarker(ctx.getJson(studentDirectStateName(S1)));
    expect(isReadBy(marker, sequencedMessageId(directPrefix(S1), 5))).toBe(true);
  });
});

describe("H1 (partial) — the unread summary reads each class document once per request", () => {
  it("tenant badge over 3 students of one class: the class document is downloaded once, not once per student", async () => {
    const ctx = createMemoryContainer(seed());
    for (const sid of [S1, S2, S3]) await sPost(STUDENT(ctx, sid, openLimits), { action: "sendDirect", body: "مرحبا" });
    const dl = countingDownloads(ctx);
    const r = await tGet(TEACHER(ctx), "?kind=unread-summary");
    expect(r.jsonBody.totalUnread).toBe(3);
    expect(dl.by("platform/classes/" + C1)).toBe(1);
  });
});

describe("H3 — sends are rate limited per sender (burst + daily), fail-closed, nothing published when refused", () => {
  it("a student's 9th reply within a minute → 429 RATE_LIMITED with Retry-After; nothing published; allowed again later", async () => {
    const ctx = createMemoryContainer(seed());
    for (let i = 0; i < SEND_LIMITS.student.burst; i++) expect((await sPost(STUDENT(ctx), { action: "sendDirect", body: "رسالة " + i })).status).toBe(200);
    const refused = await sPost(STUDENT(ctx), { action: "sendDirect", body: "رسالة زائدة" });
    expect(refused.status).toBe(429);
    expect(refused.jsonBody.code).toBe("RATE_LIMITED");
    expect(Number(refused.headers["Retry-After"])).toBeGreaterThan(0);
    expect(messageNames(ctx, S1)).toHaveLength(SEND_LIMITS.student.burst);
    clock += 60 * 1000;
    expect((await sPost(STUDENT(ctx), { action: "sendDirect", body: "بعد دقيقة" })).status).toBe(200);
  });
  it("the teacher's limit applies across direct messages and announcements", async () => {
    const ctx = createMemoryContainer(seed());
    for (let i = 0; i < SEND_LIMITS.teacher.burst; i++) {
      const r = i % 2 ? await tPost(TEACHER(ctx), { action: "sendAnnouncement", classId: C1, body: "إعلان " + i }) : await tPost(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "رسالة " + i });
      expect(r.status).toBe(200);
    }
    expect((await tPost(TEACHER(ctx), { action: "sendAnnouncement", classId: C1, body: "زائد" })).status).toBe(429);
  });
  it("evaluateSendBucket: the daily quota refuses even with burst tokens left; a refusal consumes nothing", () => {
    const limits = SEND_LIMITS.student;
    const now = 1_000_000;
    const exhausted = { burstTokens: limits.burst, dailyTokens: 0.2, updatedAt: now };
    const r = evaluateSendBucket(exhausted, limits, now);
    expect(r.allowed).toBe(false);
    expect(r.scope).toBe("daily");
    expect(r.next.burstTokens).toBe(limits.burst);
    expect(evaluateSendBucket(null, limits, now).allowed).toBe(true);
  });
  it("a storage failure of the limiter refuses the send (fail-closed): 500, nothing published", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await sPost(STUDENT(ctx, S1, { reserveMessageSend: async () => { throw new Error("storage down"); } }), { action: "sendDirect", body: "مرحبا" });
    expect(r.status).toBe(500);
    expect(messageNames(ctx, S1)).toHaveLength(0);
  });
});

describe("M3 — a retried send with the same clientMessageId never publishes a second copy", () => {
  it("teacher: two requests with one key → ONE message, the second is a replay; audit and push happen once", async () => {
    const ctx = createMemoryContainer(seed());
    const body = { action: "sendDirect", studentId: S1, body: "موعد الاختبار الأحد", clientMessageId: "key-abcdef-123" };
    const a = await tPost(TEACHER(ctx), body);
    const b = await tPost(TEACHER(ctx), body);
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(b.jsonBody.replay).toBe(true);
    expect(b.jsonBody.message.messageId).toBe(a.jsonBody.message.messageId);
    expect(messageNames(ctx, S1)).toHaveLength(1);
    expect(audits.filter(e => e.action === "message.sendDirect")).toHaveLength(1);
    expect(pushes).toEqual([S1]);
  });
  it("student: a replay of the same key returns the same reply; a different key publishes a new one", async () => {
    const ctx = createMemoryContainer(seed());
    const a = await sPost(STUDENT(ctx), { action: "sendDirect", body: "شكرًا", clientMessageId: "student-key-0001" });
    const b = await sPost(STUDENT(ctx), { action: "sendDirect", body: "شكرًا", clientMessageId: "student-key-0001" });
    const c = await sPost(STUDENT(ctx), { action: "sendDirect", body: "شكرًا", clientMessageId: "student-key-0002" });
    expect(b.jsonBody.message.messageId).toBe(a.jsonBody.message.messageId);
    expect(c.jsonBody.message.messageId).not.toBe(a.jsonBody.message.messageId);
    expect(messageNames(ctx, S1)).toHaveLength(2);
  });
  it("a request still in flight with the same key → 409 SEND_IN_PROGRESS (retryable); a stale claim is taken over", async () => {
    const ctx = createMemoryContainer(seed());
    const key = { role: "student", senderId: S1, streamPrefix: directPrefix(S1), clientMessageId: "inflight-key-01" };
    ctx.setJson(sendKeyName(key), { schemaVersion: 1, state: "pending", claimedAt: new Date(clock - 5000).toISOString() });
    const busy = await sPost(STUDENT(ctx), { action: "sendDirect", body: "مرحبا", clientMessageId: "inflight-key-01" });
    expect(busy.status).toBe(409);
    expect(busy.jsonBody.code).toBe("SEND_IN_PROGRESS");
    expect(messageNames(ctx, S1)).toHaveLength(0);
    clock += 60 * 1000;                                                     // the claim's request died long ago
    const taken = await sPost(STUDENT(ctx), { action: "sendDirect", body: "مرحبا", clientMessageId: "inflight-key-01" });
    expect(taken.status).toBe(200);
    expect(messageNames(ctx, S1)).toHaveLength(1);
  });
  it("a send refused by the rate limit releases its key: the same key publishes once allowed", async () => {
    const ctx = createMemoryContainer(seed());
    let allow = false;
    const deps = STUDENT(ctx, S1, { reserveMessageSend: async () => (allow ? { allowed: true, retryAfterSeconds: 0, scope: "" } : { allowed: false, retryAfterSeconds: 5, scope: "burst" }) });
    expect((await sPost(deps, { action: "sendDirect", body: "مرحبا", clientMessageId: "release-key-01" })).status).toBe(429);
    allow = true;
    expect((await sPost(deps, { action: "sendDirect", body: "مرحبا", clientMessageId: "release-key-01" })).status).toBe(200);
    expect(messageNames(ctx, S1)).toHaveLength(1);
  });
  it("a malformed key is ignored (the send behaves as before)", async () => {
    const ctx = createMemoryContainer(seed());
    expect((await sPost(STUDENT(ctx), { action: "sendDirect", body: "أ", clientMessageId: "bad key/../x" })).status).toBe(200);
    expect((await sPost(STUDENT(ctx), { action: "sendDirect", body: "أ", clientMessageId: "bad key/../x" })).status).toBe(200);
    expect(messageNames(ctx, S1)).toHaveLength(2);
    expect(ctx.names("platform/messages/send-keys/")).toHaveLength(0);
  });
});

describe("L1 — message text: invisible / bidi-override characters are removed, oversized input is refused early", () => {
  it("normalizeMessageBody", () => {
    expect(normalizeMessageBody("‮مرحبا‬")).toEqual({ ok: true, body: "مرحبا" });
    expect(normalizeMessageBody("⁦abc⁩ ​")).toEqual({ ok: true, body: "abc" });
    expect(normalizeMessageBody("​​﻿").ok).toBe(false);
    expect(normalizeMessageBody("\u0085\u009Fنص").body).toBe("نص");
    expect(normalizeMessageBody("می‌خواهم").body).toBe("می‌خواهم");     // ZWNJ kept
    expect(normalizeMessageBody("é").body).toBe("é");                     // NFC
    expect(normalizeMessageBody("x".repeat(MAX_BODY_LENGTH * 4 + 1)).ok).toBe(false);
    expect(normalizeMessageBody("x".repeat(MAX_BODY_LENGTH)).ok).toBe(true);
  });
  it("a body of only invisible characters is refused by the API (400), nothing published", async () => {
    const ctx = createMemoryContainer(seed());
    expect((await sPost(STUDENT(ctx), { action: "sendDirect", body: "​‮​" })).status).toBe(400);
    expect(messageNames(ctx, S1)).toHaveLength(0);
  });
});

describe("L2 — every messages response is Cache-Control: no-store", () => {
  it("teacher and student, reads and writes, success and error", async () => {
    const ctx = createMemoryContainer(seed());
    const responses = [
      await tGet(TEACHER(ctx), "?studentId=" + S1),
      await tGet(TEACHER(ctx), "?classId=" + C1 + "&kind=announcements"),
      await tGet(TEACHER(ctx), "?kind=unread-summary"),
      await tPost(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "مرحبا" }),
      await tPost(TEACHER(ctx), { action: "nope" }),
      await sGet(STUDENT(ctx)),
      await sGet(STUDENT(ctx), "?view=unread"),
      await sPost(STUDENT(ctx), { action: "sendDirect", body: "أهلًا" })
    ];
    for (const r of responses) expect(r.headers?.["Cache-Control"]).toBe("no-store");
  });
});

describe("M5 — one unparsable blob never turns a thread or a badge into a permanent 500", () => {
  it("a corrupt message is skipped in the thread; a corrupt marker reads as no progress; the badge still answers", async () => {
    const ctx = createMemoryContainer(seed());
    await sPost(STUDENT(ctx, S1, openLimits), { action: "sendDirect", body: "الأولى" });
    await sPost(STUDENT(ctx, S1, openLimits), { action: "sendDirect", body: "الثانية" });
    ctx.store.set(directPrefix(S1) + sequencedMessageId(directPrefix(S1), 1) + ".json", { content: Buffer.from("{not json"), etag: "x1", contentType: "" });
    ctx.store.set(teacherDirectStateName(T1, S1), { content: Buffer.from("{oops"), etag: "x2", contentType: "" });
    const thread = await tGet(TEACHER(ctx), "?studentId=" + S1);
    expect(thread.status).toBe(200);
    expect(thread.jsonBody.messages.map(m => m.body)).toEqual(["الثانية"]);  // the corrupt one is skipped, the rest still shows
    const badge = await tGet(TEACHER(ctx), "?kind=unread-summary");
    expect(badge.status).toBe(200);
    expect(badge.jsonBody.totalUnread).toBe(1);
  });
});

describe("L3 / L4 — contention is retryable; audits name the message", () => {
  it("losing every stream-position race → 503 BUSY with Retry-After (was a generic 500)", async () => {
    const ctx = createMemoryContainer(seed());
    const conflict = async () => { const e = new Error("BlobAlreadyExists"); e.statusCode = 409; e.code = "BlobAlreadyExists"; throw e; };
    const r = await sPost(STUDENT(ctx, S1, { ...openLimits, uploadJsonConditional: conflict }), { action: "sendDirect", body: "مرحبا" });
    expect(r.status).toBe(503);
    expect(r.jsonBody.code).toBe("BUSY");
    expect(r.headers["Retry-After"]).toBe("1");
  });
  it("teacher send audits carry the published messageId (never the body)", async () => {
    const ctx = createMemoryContainer(seed());
    const d = await tPost(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "سري جدًا" });
    const a = await tPost(TEACHER(ctx), { action: "sendAnnouncement", classId: C1, body: "إعلان سري" });
    expect(audits.find(e => e.action === "message.sendDirect").details.messageId).toBe(d.jsonBody.message.messageId);
    expect(audits.find(e => e.action === "message.sendAnnouncement").details.messageId).toBe(a.jsonBody.message.messageId);
    expect(JSON.stringify(audits)).not.toContain("سري");
  });
});

describe("tenancy is unchanged (pin)", () => {
  it("another teacher's student is still 404 for read, send and mark", async () => {
    const ctx = createMemoryContainer(seed({ ["platform/classes/" + C1 + ".json"]: { classId: C1, name: "صف آخر", active: true, ownerId: "teacher-2", studentIds: [S1] } }));
    expect((await tGet(TEACHER(ctx), "?studentId=" + S1)).status).toBe(404);
    expect((await tPost(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "x" })).status).toBe(404);
    expect(messageNames(ctx, S1)).toHaveLength(0);
    expect(announcementPrefix(C1)).toContain(C1);
  });
});
