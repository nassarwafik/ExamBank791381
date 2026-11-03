import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P5-B3b — moving ONE student into another teacher's class (owner only; owner decisions §19.21, D16). TEST data only.
//   the new teacher sees the student's learning progress, but NOT the old class's grades (profile) nor the conversation before the
//   transfer (thread, unread, edit / delete); the former teacher keeps the old results as «منقول» (read-only, outside the stats);
//   refused while work awaits the former teacher, re-checked after the write (an attempt started meanwhile reverts the move);
//   stale / impossible requests refused with nothing written; roster indexes, ledger and owner audit.
// The first block (visibility of a moved student) is the FAIL-FIRST evidence: it seeds the moved state directly, so it runs on main.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p5b3b-student-transfer-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: ownerClasses } = await import("../src/functions/owner-classes.js");
const { handler: students } = await import("../src/functions/manage-students.js");
const { handler: messages } = await import("../src/functions/messages.js");
const { handler: results } = await import("../src/functions/assignment-results.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { directPrefix, sequencedMessageId } = await import("../src/lib/message-store.js");
const { createUnreadMemo } = await import("../src/lib/message-unread-memo.js");
const { mutateJsonWithRetry } = cjs("../src/lib/platform-storage.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const OWNER_ID = "own_0011223344556677";
const A = "t_00112233445566aa", B = "t_00112233445566bb";
const S = "11111111-1111-1111-1111-111111111111";
const T0 = Date.parse("2026-11-01T08:00:00.000Z"), T1 = Date.parse("2026-11-02T08:00:00.000Z"), T2 = Date.parse("2026-11-03T08:00:00.000Z");
const cls = (classId, ownerId, over = {}) => ({ schemaVersion: 1, classId, name: "صف " + classId, grade: "11", schoolYear: "2026-2027", active: true, status: "active", studentIds: [], ownerId, ...over });

function setup({ moved = false } = {}) {
  resetOperatorGateCache();
  const student = { schemaVersion: 3, role: "student", userId: S, classId: moved ? "cB" : "cA", ownerId: moved ? B : A, displayName: "ليان سعيد", firstName: "ليان", familyName: "سعيد", code: "300000001", identityNumber: "300000001", active: true, archived: false, authVersion: 1, ...(moved ? { directSince: new Date(T1).toISOString(), transferHistory: [{ fromClassId: "cA", toClassId: "cB", from: A, to: B, at: new Date(T1).toISOString(), by: "owner:x" }] } : {}) };
  const mem = createMemoryContainer({
    "platform/classes/cA.json": cls("cA", A, { studentIds: moved ? [] : [S] }), "platform/classes/cA2.json": cls("cA2", A),
    "platform/classes/cB.json": cls("cB", B, { studentIds: moved ? [S] : [] }), "platform/classes/cBold.json": cls("cBold", B, { active: false, status: "archived" }),
    ["platform/users/" + S + ".json"]: student,
    "platform/assignments/a1.json": { assignmentId: "a1", classId: "cA", status: "published", title: "واجب سارة", maxAttempts: 1, questionCount: 1, totalMarks: 10, createdAt: "2026-10-01T00:00:00.000Z" },
    ["platform/submissions/a1/" + S + ".json"]: { assignmentId: "a1", studentId: S, classId: "cA", attempts: [{ attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, finalized: true, submittedAt: "2026-10-02T00:00:00.000Z" }] }
  });
  const put = (p, at, senderRole) => { const prefix = directPrefix(S); const id = sequencedMessageId(prefix, p); mem.setJson(prefix + id + ".json", { schemaVersion: 1, messageId: id, createdAt: new Date(at).toISOString(), kind: "direct", studentId: S, senderRole, senderId: senderRole === "student" ? S : A, senderDisplayName: senderRole === "student" ? "ليان" : "سارة", body: "رسالة " + p }); return id; };
  const ids = { before: put(1, T0, "student"), beforeTeacher: put(2, T0 + 1000, "teacher") };
  const now = Date.now();
  for (const [id, username] of [[A, "t.sara"], [B, "t.omar"]]) mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: username, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] });
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const heads = {};
  for (const [name, ago] of [["owner", 0], ["ownerStale", 11 * 60 * 1000]]) {
    const sid = (ago ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - ago });
    heads[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  const base = { getContainer: () => mem.container, container: mem.container, recordAuditEvent: async () => {} };
  const as = sub => ({ ...base, requireBuilderAuth: () => ({ ok: true, user: { sub, am: "multi-user" } }), unreadMemo: createUnreadMemo(), resolveTeacherDisplayName: async () => "أ.", notifyStudentOfNewMessage: async () => {}, now: () => T2 });
  return { mem, put, ids, ...heads, ownerDeps: base, as };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const owner = (ctx, action, body, headers = ctx.owner, deps = ctx.ownerDeps) => ownerClasses({ method: "POST", url: "https://x/api/owner-classes/" + action, params: { action }, headers: hdr(headers), json: async () => body }, deps);
const ownerGet = (ctx, action, query) => ownerClasses({ method: "GET", url: "https://x/api/owner-classes/" + action, params: { action }, query: new URLSearchParams(query), headers: hdr(ctx.owner) }, ctx.ownerDeps);
const profile = async (ctx, sub) => (await students({ method: "GET", url: "https://x/api/students?profileUserId=" + S, headers: hdr({}) }, ctx.as(sub))).jsonBody;
const thread = async (ctx, sub) => (await messages({ method: "GET", url: "https://x/api/messages?studentId=" + S, headers: hdr({}) }, ctx.as(sub))).jsonBody;
const unread = async (ctx, sub) => Number((await messages({ method: "GET", url: "https://x/api/messages?kind=unread-summary", headers: hdr({}) }, ctx.as(sub))).jsonBody.totalUnread);
const gradebook = async (ctx, sub) => (await results({ method: "GET", url: "https://x/api/assignment-results?assignmentId=a1", headers: hdr({}) }, ctx.as(sub))).jsonBody;
const TRANSFER = { userId: S, fromClassId: "cA", toClassId: "cB", reason: "انتقل إلى شعبة أخرى" };

describe("P5-B3b fail-first — a student moved to teacher B (state seeded directly)", () => {
  it("B's profile of the student does not list teacher A's assignment and grade", async () => {
    const ctx = setup({ moved: true });
    const p = await profile(ctx, B);
    expect(p.ok).toBe(true);
    expect(p.profile.submittedAssignments.map(x => x.assignmentId)).toEqual([]);
  });
  it("B does not see the conversation from before the transfer", async () => {
    const ctx = setup({ moved: true });
    expect((await thread(ctx, B)).messages.map(m => m.messageId)).toEqual([]);
  });
  it("A keeps the moved student's result in the gradebook as «منقول», outside the class statistics", async () => {
    const ctx = setup({ moved: true });
    const g = await gradebook(ctx, A);
    expect(g.students.map(s => s.studentId)).toEqual([]);
    expect(g.stats.students).toBe(0);
    expect(g.movedStudents).toEqual([expect.objectContaining({ studentId: S, movedOut: true, movedAt: new Date(T1).toISOString(), gradingStatus: "final", latestResult: expect.objectContaining({ score: 8, percentage: 80 }) })]);
  });
});

describe("P5-B3b the transfer", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });
  it("preview first (nothing written); then the student is B's: class, owner, transfer moment, history, roster indexes, ledger, audit", async () => {
    const before = JSON.stringify([...ctx.mem.store.entries()].sort());
    const p = await ownerGet(ctx, "student-transfer-preview", { userId: S, toClassId: "cB" });
    expect(p.jsonBody.preview).toMatchObject({ userId: S, fromClassId: "cA", from: A, toClassId: "cB", to: B, pendingGrading: 0 });
    expect(JSON.stringify([...ctx.mem.store.entries()].sort())).toBe(before);
    const r = await owner(ctx, "student-transfer", TRANSFER);
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const doc = ctx.mem.getJson("platform/users/" + S + ".json");
    expect(doc).toMatchObject({ classId: "cB", ownerId: B, directSince: expect.any(String) });
    expect(Date.parse(doc.directSince)).toBeGreaterThan(T0);
    expect(doc.transferHistory).toEqual([expect.objectContaining({ fromClassId: "cA", toClassId: "cB", from: A, to: B, reason: "انتقل إلى شعبة أخرى" })]);
    expect(ctx.mem.getJson("platform/classes/cA.json").studentIds).not.toContain(S);
    expect(ctx.mem.getJson("platform/classes/cB.json").studentIds).toContain(S);
    expect(r.jsonBody.ledger).toMatchObject({ kind: "student", userId: S, from: A, to: B, complete: true, readMarker: true });
    expect(ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n).action)).toEqual(["owner.student.transferred"]);
    expect(ctx.mem.getJson("platform/submissions/a1/" + S + ".json").classId).toBe("cA");                      // nothing rewritten
  });
  it("after it: B's unread starts at zero, sees only what follows; cannot change an old message; A keeps the result as «منقول»", async () => {
    await owner(ctx, "student-transfer", TRANSFER);
    expect(await unread(ctx, B)).toBe(0);
    const after = ctx.put(3, Date.now() + 60_000, "student");                                  // written after the transfer
    expect(await unread(ctx, B)).toBe(1);
    expect((await thread(ctx, B)).messages.map(m => m.messageId)).toEqual([after]);
    const del = await messages({ method: "POST", url: "https://x/api/messages", headers: hdr({}), json: async () => ({ action: "deleteMessage", studentId: S, messageId: ctx.ids.before }) }, ctx.as(B));
    expect(del.status).toBe(404);
    expect(ctx.mem.getJson(directPrefix(S) + ctx.ids.before + ".json")).not.toBeNull();
    expect((await profile(ctx, B)).profile.submittedAssignments).toEqual([]);
    expect((await gradebook(ctx, A)).movedStudents.map(s => s.studentId)).toEqual([S]);
    expect((await profile(ctx, A)).ok).not.toBe(true);                                                         // no longer A's student
  });
});

describe("P5-B3b refusals — nothing written", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });
  const snapshot = ctx => JSON.stringify([ctx.mem.getJson("platform/users/" + S + ".json"), ctx.mem.getJson("platform/classes/cA.json"), ctx.mem.getJson("platform/classes/cB.json")]);
  it("work awaiting the former teacher (an open attempt or a result to review) → 409 PENDING_GRADING", async () => {
    for (const sub of [{ assignmentId: "a1", studentId: S, classId: "cA", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-11-02T07:00:00.000Z" } }, { assignmentId: "a1", studentId: S, classId: "cA", attempts: [{ attemptNumber: 1, score: 3, totalMarks: 10, percentage: 30, finalized: false }] }]) {
      ctx.mem.setJson("platform/submissions/a1/" + S + ".json", sub);
      const before = snapshot(ctx);
      const r = await owner(ctx, "student-transfer", TRANSFER);
      expect([r.status, r.jsonBody.code]).toEqual([409, "PENDING_GRADING"]);
      expect(snapshot(ctx)).toBe(before);
    }
  });
  it("an attempt started between the check and the write reverts the move (post-write re-check)", async () => {
    let raced = false;
    const racing = { ...ctx.ownerDeps, mutateJsonWithRetry: async (c, name, fn, ...rest) => {
      const out = await mutateJsonWithRetry(c, name, fn, ...rest);
      if (!raced && name === "platform/users/" + S + ".json") { raced = true; ctx.mem.setJson("platform/submissions/a1/" + S + ".json", { assignmentId: "a1", studentId: S, classId: "cA", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-11-02T08:00:00.000Z" } }); }
      return out;
    } };
    const r = await owner(ctx, "student-transfer", TRANSFER, ctx.owner, racing);
    expect([r.status, r.jsonBody.code]).toEqual([409, "PENDING_GRADING"]);
    const doc = ctx.mem.getJson("platform/users/" + S + ".json");
    expect([doc.classId, doc.ownerId, doc.directSince, doc.transferHistory]).toEqual(["cA", A, undefined, []]);
    expect(ctx.mem.names("platform/transfers/")).toEqual([]);
  });
  it("same teacher, archived or unowned target, stale source class, unknown student, no step-up", async () => {
    const before = snapshot(ctx);
    expect((await owner(ctx, "student-transfer", { ...TRANSFER, toClassId: "cA2" })).jsonBody.code).toBe("SAME_TEACHER");
    expect((await owner(ctx, "student-transfer", { ...TRANSFER, toClassId: "cBold" })).jsonBody.code).toBe("CLASS_ARCHIVED");
    expect((await owner(ctx, "student-transfer", { ...TRANSFER, toClassId: "nope" })).jsonBody.code).toBe("CLASS_NOT_FOUND");
    expect((await owner(ctx, "student-transfer", { ...TRANSFER, fromClassId: "cA2" })).jsonBody.code).toBe("TRANSFER_STALE");
    expect((await owner(ctx, "student-transfer", { ...TRANSFER, userId: "nope" })).jsonBody.code).toBe("STUDENT_NOT_FOUND");
    expect((await owner(ctx, "student-transfer", TRANSFER, ctx.ownerStale)).jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect(snapshot(ctx)).toBe(before);
    expect(ctx.mem.names("platform/transfers/")).toEqual([]);
  });
  it("the owner's class roster lists the class's students", async () => {
    const r = await ownerGet(ctx, "students", { classId: "cA" });
    expect(r.jsonBody.students).toEqual([{ userId: S, displayName: "ليان سعيد", identityNumber: "300000001", active: true, archived: false }]);
    expect((await ownerGet(ctx, "students", { classId: "nope" })).jsonBody.code).toBe("CLASS_NOT_FOUND");
  });
});
