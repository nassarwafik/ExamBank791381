import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P7-B1 — owner decision D14 (§19.25): the owner reads ONE conversation, read only, with a written reason and a recent
// second-factor check, recorded in the owner's audit log and in the teacher's activity log. A new owner route (a feature: no
// fail-first). TEST data only.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p7b1-owner-conversations-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: studentNotifications } = await import("../src/functions/student-notifications.js");
const { directPrefix, sequencedMessageId } = await import("../src/lib/message-store.js");
const { createUnreadMemo } = await import("../src/lib/message-unread-memo.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { createStudentToken } = await import("../src/lib/student-auth.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { AUDIT_PREFIX, OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
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

const { handler: ownerConversations } = await import("../src/functions/owner-conversations.js");
const { handler: auditHistory } = await import("../src/functions/audit-history.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");

describe("P7-B1 — D14: the owner reads one conversation, read only, for a written reason", () => {
  const OWNER = "own_0011223344556677";
  function withOwner(ctx, stale = false) {
    const now = Date.now();
    ctx.mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER, completedAtMs: now });
    ctx.mem.setJson(ownerAccountName(OWNER), { schemaVersion: 1, accountId: OWNER, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
    const sid = (stale ? "d" : "c").repeat(32);
    ctx.mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: stale ? now - 11 * 60e3 : now });
    return { "x-owner-token": createOwnerToken({ accountId: OWNER, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  const open = (ctx, h, body) => ownerConversations({ method: "POST", params: { action: "open" }, headers: hdr(h), json: async () => body }, ctx.deps);
  const REASON = "شكوى ولي أمر بتاريخ اليوم";
  const teacherLog = async (ctx, accountId) => (await auditHistory({ method: "GET", url: "https://x/api/audit-history", headers: hdr({ "x-builder-token": createManagedTeacherToken({ accountId, sid: newTeacherSessionId(), authVersion: 1 }).token }) }, ctx.deps)).jsonBody.events;

  it("refused without a recent second-factor check, without a reason, for an unknown student; nothing is recorded", async () => {
    const ctx = setup({ preset: "full-teaching", version: 2 });
    const owner = withOwner(ctx), stale = withOwner(ctx, true);
    expect((await open(ctx, stale, { studentId: S1, reason: REASON })).jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect((await open(ctx, owner, { studentId: S1, reason: "قصير" })).jsonBody.code).toBe("REASON_REQUIRED");
    expect((await open(ctx, owner, { studentId: "no-such-student", reason: REASON })).status).toBe(404);
    expect((await open(ctx, owner, { studentId: "../x", reason: REASON })).status).toBe(400);
    expect(ctx.mem.names(OWNER_AUDIT_PREFIX).filter(n => ctx.mem.getJson(n).action === "owner.conversation.opened")).toEqual([]);
  });

  it("opened: the thread, read only (nothing written to it, no read marker moved), recorded with the reason in both logs", async () => {
    const ctx = setup({ preset: "full-teaching", version: 2 });
    const owner = withOwner(ctx);
    const namesBefore = ctx.mem.names("platform/messages/").sort();
    const r = await open(ctx, owner, { studentId: S1, reason: REASON });
    expect(r.status).toBe(200);
    expect(r.jsonBody.messages.map(m => m.body)).toEqual(["رسالة 1", "رسالة 2", "رسالة 3"]);
    expect(r.jsonBody.messages.every(m => !("canDelete" in m) && !("editableUntil" in m))).toBe(true);
    expect(ctx.mem.names("platform/messages/").sort()).toEqual(namesBefore);
    const own = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).filter(e => e.action === "owner.conversation.opened");
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ actor: "owner:" + OWNER, targetId: S1, details: { reason: REASON, messages: 3, teacherAccountId: SARA } });
    const tlog = ctx.mem.names(AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).filter(e => e.action === "owner.conversation.opened");
    expect(tlog).toHaveLength(1);
    expect(tlog[0]).toMatchObject({ actor: "owner", forTeacher: SARA, targetId: S1, targetLabel: "ليان", details: { reason: REASON } });
    // the student's teacher sees it in their own activity log; another teacher does not
    expect((await teacherLog(ctx, SARA)).map(e => [e.action, e.details.reason])).toEqual([["owner.conversation.opened", REASON]]);
    expect((await teacherLog(ctx, OMAR)).filter(e => e.action === "owner.conversation.opened")).toEqual([]);
    // the student still has the same unread count (no marker moved)
    expect((await studentNotifications(sGet(ctx, "/api/student-notifications?view=unread"), ctx.deps)).jsonBody.messages.totalUnread).toBe(2);
  });

  it("every opening is recorded — an older page too; an opening that cannot be recorded is not served (fail closed)", async () => {
    const ctx = setup({ preset: "full-teaching", version: 2 });
    const owner = withOwner(ctx);
    const first = await open(ctx, owner, { studentId: S1, reason: REASON });
    const older = await open(ctx, owner, { studentId: S1, reason: REASON + " — صفحة أقدم", before: first.jsonBody.messages[1].messageId });
    expect(older.jsonBody.messages.map(m => m.body)).toEqual(["رسالة 1"]);
    expect(ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).filter(e => e.action === "owner.conversation.opened")).toHaveLength(2);
    const failing = { ...ctx.deps, recordOwnerAuditEvent: async () => { throw new Error("audit storage down"); } };
    const r = await ownerConversations({ method: "POST", params: { action: "open" }, headers: hdr(owner), json: async () => ({ studentId: S1, reason: REASON }) }, failing);
    expect([r.status, r.jsonBody.messages]).toEqual([503, undefined]);
  });

  it("there is no other way in: no list, no GET, no write action", async () => {
    const ctx = setup({ preset: "full-teaching", version: 2 });
    const owner = withOwner(ctx);
    for (const [method, action] of [["GET", ""], ["GET", "open"], ["POST", "list"], ["POST", "reply"], ["POST", "delete"]]) {
      expect((await ownerConversations({ method, params: { action }, headers: hdr(owner), json: async () => ({ studentId: S1, reason: REASON }) }, ctx.deps)).status).toBe(404);
    }
    expect((await ownerConversations({ method: "POST", params: { action: "open" }, headers: hdr(ctx.student), json: async () => ({ studentId: S1, reason: REASON }) }, ctx.deps)).status).toBe(401);
  });
});

describe("P7-B1 — the strict audit writers", () => {
  const { recordAuditEvent, recordOwnerAuditEvent, recordAuditEventStrict, recordOwnerAuditEventStrict } = cjs("../src/lib/audit-log.js");
  const broken = { getBlockBlobClient: () => ({ upload: async () => { throw new Error("storage down"); } }) };
  it("a failed write throws for the strict variants, and is swallowed (as before) for the ordinary ones", async () => {
    await expect(recordOwnerAuditEventStrict(broken, { action: "x" })).rejects.toThrow();
    await expect(recordAuditEventStrict(broken, { action: "x" })).rejects.toThrow();
    await expect(recordOwnerAuditEvent(broken, { action: "x" })).resolves.toBeUndefined();
    await expect(recordAuditEvent(broken, { action: "x" })).resolves.toBeUndefined();
  });
});
