import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P7-B1 — the student's messaging follows the access of the student's teacher (blueprint acceptance test 8): a teacher
// without messages.inbox.read has no messaging for their students while the owner enforces access. TEST data only.
// (D14, the owner's audited reading of one conversation: owner-conversations-p7b1.test.js.)
// The first block is the FAIL-FIRST proof: on the baseline (before P7-B1) the student of a «التعلّم فقط» teacher still read the
// thread, could send, and saw the message counts and previews in the bell.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p7b1-student-messages-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: studentMessages } = await import("../src/functions/student-messages.js");
const { handler: studentNotifications } = await import("../src/functions/student-notifications.js");
const { directPrefix, sequencedMessageId } = await import("../src/lib/message-store.js");
const { createUnreadMemo } = await import("../src/lib/message-unread-memo.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createStudentToken } = await import("../src/lib/student-auth.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";
const S1 = "11111111-1111-1111-1111-111111111111";
const T0 = Date.parse("2026-11-04T08:00:00.000Z");

function setup({ mode = "enforce", preset = "learning-only", version = 1, status = "active", classOwner = SARA } = {}) {
  resetRevisionCache(); resetOperatorGateCache();
  const mem = createMemoryContainer();
  for (const [id, name] of [[SARA, "سارة"], [OMAR, "عمر"]]) {
    const { revision } = buildRevision({ accountId: id, presetId: id === SARA ? preset : "full-teaching", presetVersion: id === SARA ? version : 2, createdBy: "owner:x" });
    mem.setJson(revisionName(revision.revisionId), revision);
    mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username: "t." + id.slice(-2), displayName: name, status: id === SARA ? status : "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: preset, version } });
  }
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  mem.setJson("platform/classes/c1.json", { classId: "c1", name: "صف سارة", status: "active", active: true, ...(classOwner ? { ownerId: classOwner } : {}) });
  mem.setJson("platform/users/" + S1 + ".json", { schemaVersion: 3, userId: S1, role: "student", code: "1001", displayName: "ليان", classId: "c1", active: true, archived: false, authVersion: 1, createdAt: "2026-01-01T00:00:00.000Z" });
  const prefix = directPrefix(S1);
  for (let p = 1; p <= 3; p++) {
    const id = sequencedMessageId(prefix, p);
    mem.setJson(prefix + id + ".json", { schemaVersion: 1, messageId: id, createdAt: new Date(T0 + p * 1000).toISOString(), kind: "direct", studentId: S1, senderRole: p === 2 ? "student" : "teacher", senderId: p === 2 ? S1 : SARA, senderDisplayName: p === 2 ? "ليان" : "سارة", body: "رسالة " + p });
  }
  const student = { "x-student-token": createStudentToken({ userId: S1, authVersion: 1, code: "1001", displayName: "ليان", classId: "c1" }) };
  const deps = { getContainer: () => mem.container, container: mem.container, unreadMemo: createUnreadMemo() };
  return { mem, deps, student };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const sGet = (ctx, path) => ({ method: "GET", url: "https://x" + path, headers: hdr(ctx.student) });
const sPost = (ctx, path, body) => ({ method: "POST", url: "https://x" + path, json: async () => body, headers: hdr(ctx.student) });

describe("P7-B1 fail-first — the student of a teacher without messages (enforce) has no messaging service", () => {
  it("the thread is refused, and nothing can be sent", async () => {
    const ctx = setup();
    const r = await studentMessages(sGet(ctx, "/api/student-messages"), ctx.deps);
    expect([r.status, r.jsonBody.code, r.jsonBody.service]).toEqual([403, "SERVICE_NOT_AVAILABLE", "messages"]);
    const before = ctx.mem.names(directPrefix(S1)).length;
    const s = await studentMessages(sPost(ctx, "/api/student-messages", { action: "sendDirect", body: "مرحبا", clientMessageId: "c-1" }), ctx.deps);
    expect(s.status).toBe(403);
    expect(ctx.mem.names(directPrefix(S1)).length).toBe(before);
  });
  it("the bell carries no message count and no message preview (the events stay)", async () => {
    const ctx = setup();
    const u = (await studentNotifications(sGet(ctx, "/api/student-notifications?view=unread"), ctx.deps)).jsonBody;
    expect(u.messages.totalUnread).toBe(0);
    const r = await studentNotifications(sGet(ctx, "/api/student-notifications"), ctx.deps);
    expect([r.status, Array.isArray(r.jsonBody.items)]).toEqual([200, true]);
    expect(JSON.stringify(r.jsonBody.items)).not.toMatch(/رسالة/);
  });
});

describe("P7-B1 — the messaging service follows the student's teacher", () => {
  it("full-teaching: the thread, the counts and `services.messages: true`", async () => {
    const ctx = setup({ preset: "full-teaching", version: 2 });
    const r = await studentMessages(sGet(ctx, "/api/student-messages"), ctx.deps);
    expect(r.status).toBe(200);
    const u = (await studentNotifications(sGet(ctx, "/api/student-notifications?view=unread"), ctx.deps)).jsonBody;
    expect([u.messages.totalUnread, u.services]).toEqual([2, { messages: true }]);
  });
  it("learning-only: `services.messages: false`", async () => {
    const ctx = setup();
    expect((await studentNotifications(sGet(ctx, "/api/student-notifications?view=unread"), ctx.deps)).jsonBody.services).toEqual({ messages: false });
  });
  it("observe / legacy mode: unchanged (the rule applies with enforcement)", async () => {
    for (const mode of ["observe", "legacy"]) {
      const ctx = setup({ mode });
      expect((await studentMessages(sGet(ctx, "/api/student-messages"), ctx.deps)).status).toBe(200);
    }
  });
  it("D15: a SUSPENDED teacher who holds messages keeps the service for their students", async () => {
    const ctx = setup({ preset: "full-teaching", version: 2, status: "suspended" });
    expect((await studentMessages(sGet(ctx, "/api/student-messages"), ctx.deps)).status).toBe(200);
  });
  it("the student's own owner stamp decides (a moved student follows the new teacher)", async () => {
    const ctx = setup();
    ctx.mem.setJson("platform/users/" + S1 + ".json", { ...ctx.mem.getJson("platform/users/" + S1 + ".json"), ownerId: OMAR });
    expect((await studentMessages(sGet(ctx, "/api/student-messages"), ctx.deps)).status).toBe(200);
    // the bell decides from the class it already loaded — the student's own owner stamp still wins
    expect((await studentNotifications(sGet(ctx, "/api/student-notifications?view=unread"), ctx.deps)).jsonBody.services).toEqual({ messages: true });
  });
  it("an unowned class whose workspace was never imported: today's service", async () => {
    const ctx = setup({ classOwner: null });
    expect((await studentMessages(sGet(ctx, "/api/student-messages"), ctx.deps)).status).toBe(200);
  });
  it("enforce and the teacher's revision cannot be read: the thread → 503 (fail closed); the bell works, without messages", async () => {
    const ctx = setup({ preset: "full-teaching", version: 2 });
    ctx.mem.setJson(teacherAccountName(SARA), { ...ctx.mem.getJson(teacherAccountName(SARA)), accessRevisionId: "ar_000000009_ffffffffffffffff" });
    resetRevisionCache();
    const r = await studentMessages(sGet(ctx, "/api/student-messages"), ctx.deps);
    expect([r.status, r.jsonBody.code]).toEqual([503, "SERVICE_CHECK_UNAVAILABLE"]);
    const u = await studentNotifications(sGet(ctx, "/api/student-notifications?view=unread"), ctx.deps);
    expect([u.status, u.jsonBody.messages.totalUnread, u.jsonBody.services]).toEqual([200, 0, { messages: false }]);
  });
});

