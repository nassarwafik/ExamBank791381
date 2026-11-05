import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P5-B3a — moving a WHOLE class to another teacher (owner only; owner decision §19.21: «كل تاريخ الصف»). TEST data only.
//   preview first (counts only, nothing written); the transfer moves class.ownerId AND every student of the class (archived ones too)
//   to the new teacher, who then has the class's whole history (assignments, results, pending grading) while the former teacher has
//   none; stale / impossible requests are refused with nothing written; a run interrupted half-way is completed by running it again
//   (never moved twice); a student owned by a third teacher is never touched; one ledger record + the owner audit per run.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p5b3a-class-transfer-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: ownerClasses } = await import("../src/functions/owner-classes.js");
const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { handler: students } = await import("../src/functions/manage-students.js");
const { handler: assignments } = await import("../src/functions/manage-assignments.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { LEDGER_PREFIX } = await import("../src/lib/teacher-transfer.js");
const { mutateJsonWithRetry } = cjs("../src/lib/platform-storage.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const OWNER_ID = "own_0011223344556677";
const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb", HUDA = "t_00112233445566cc";
const stu = (userId, over = {}) => ({ schemaVersion: 3, role: "student", userId, classId: "cA", displayName: "طالب " + userId, firstName: "طالب", familyName: userId, code: "C" + userId, identityNumber: "C" + userId, active: true, archived: false, authVersion: 1, ownerId: SARA, ...over });

function setup() {
  resetOperatorGateCache();
  const mem = createMemoryContainer({
    "platform/classes/cA.json": { schemaVersion: 1, classId: "cA", name: "الحادي عشر أ", grade: "11", schoolYear: "2026-2027", active: true, status: "active", studentIds: ["s1", "s2", "s3"], ownerId: SARA },
    "platform/classes/legacy.json": { classId: "legacy", name: "قديم", active: true },
    "platform/users/s1.json": stu("s1"),
    "platform/users/s2.json": stu("s2", { archived: true, active: false }),
    "platform/users/s3.json": stu("s3", { ownerId: undefined }),
    "platform/users/s4.json": stu("s4", { ownerId: HUDA }),
    "platform/assignments/a1.json": { assignmentId: "a1", classId: "cA", status: "published", title: "واجب الشبكات", className: "الحادي عشر أ", maxAttempts: 1, questionCount: 1, totalMarks: 10 },
    "platform/submissions/a1/s1.json": { assignmentId: "a1", studentId: "s1", classId: "cA", attempts: [{ attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, finalized: true }] }
  });
  const now = Date.now();
  for (const [id, username] of [[SARA, "t.sara"], [OMAR, "t.omar"], [HUDA, "t.huda"]]) mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: username, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] });
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const heads = {};
  for (const [name, ago] of [["owner", 0], ["ownerStale", 11 * 60 * 1000]]) {
    const sid = (ago ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - ago });
    heads[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  const deps = { getContainer: () => mem.container, container: mem.container, recordAuditEvent: async () => {} };
  const tok = id => ({ "x-builder-token": recordedManagedToken(mem, { accountId: id, sid: newTeacherSessionId(), authVersion: 1 }).token });
  return { mem, deps, ...heads, sara: tok(SARA), omar: tok(OMAR) };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const post = (ctx, action, body, headers = ctx.owner, deps = ctx.deps) => ownerClasses({ method: "POST", url: "https://x/api/owner-classes/" + action, params: { action }, headers: hdr(headers), json: async () => body }, deps);
const preview = (ctx, classId, toAccountId) => ownerClasses({ method: "GET", url: "https://x/api/owner-classes/transfer-preview", params: { action: "transfer-preview" }, query: new URLSearchParams({ classId, toAccountId }), headers: hdr(ctx.owner) }, ctx.deps);
const asTeacher = (fn, url) => (ctx, headers) => fn({ method: "GET", url, headers: hdr(headers) }, ctx.deps);
const teacherClasses = async (ctx, h) => (await asTeacher(classrooms, "https://x/api/classrooms")(ctx, h)).jsonBody.classes.map(c => c.classId);
const teacherStudents = async (ctx, h) => (await asTeacher(students, "https://x/api/students?includeArchived=1")(ctx, h)).jsonBody.students.map(s => s.userId).sort();
const teacherAssignments = async (ctx, h) => (await assignments({ method: "GET", url: "http://x/assignments", params: {}, headers: hdr(h) }, ctx.deps)).jsonBody.assignments.map(a => a.assignmentId);
const ledgers = ctx => ctx.mem.names(LEDGER_PREFIX).map(n => ctx.mem.getJson(n));
const audits = ctx => ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
const owners = ctx => ["s1", "s2", "s3", "s4"].map(id => ctx.mem.getJson("platform/users/" + id + ".json").ownerId ?? null);
const TRANSFER = { classId: "cA", toAccountId: OMAR, expectedFromAccountId: SARA, reason: "معلم بديل" };

describe("P5-B3a preview", () => {
  it("counts what would move; nothing is written", async () => {
    const ctx = setup();
    const before = JSON.stringify([...ctx.mem.store.entries()].sort());
    const r = await preview(ctx, "cA", OMAR);
    expect(r.status).toBe(200);
    expect(r.jsonBody.preview).toMatchObject({ classId: "cA", from: SARA, to: OMAR, students: { total: 4, archived: 1, foreign: 1 }, assignments: { total: 1, byStatus: { published: 1 } }, pendingGrading: 0 });
    expect(JSON.stringify([...ctx.mem.store.entries()].sort())).toBe(before);
  });
});

describe("P5-B3a the transfer", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });
  it("the class and every one of its students (archived too) move; the new teacher has the whole history, the former none", async () => {
    expect(await teacherClasses(ctx, ctx.sara)).toContain("cA");
    const r = await post(ctx, "transfer", TRANSFER);
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(r.jsonBody.ledger).toMatchObject({ kind: "class", classId: "cA", from: SARA, to: OMAR, complete: true, resumed: false, students: { moved: 3, skipped: 1, failed: 0 } });
    const cls = ctx.mem.getJson("platform/classes/cA.json");
    expect(cls.ownerId).toBe(OMAR);
    expect(cls.ownerHistory).toEqual([expect.objectContaining({ from: SARA, to: OMAR, by: "owner:" + OWNER_ID, reason: "معلم بديل" })]);
    expect(owners(ctx)).toEqual([OMAR, OMAR, OMAR, HUDA]);                       // a third teacher's student is never touched
    expect(await teacherClasses(ctx, ctx.omar)).toContain("cA");
    expect(await teacherClasses(ctx, ctx.sara)).not.toContain("cA");
    expect(await teacherStudents(ctx, ctx.omar)).toEqual(["s1", "s2", "s3"]);
    expect(await teacherStudents(ctx, ctx.sara)).toEqual([]);
    expect(await teacherAssignments(ctx, ctx.omar)).toEqual(["a1"]);
    expect(await teacherAssignments(ctx, ctx.sara)).toEqual([]);
    expect(ctx.mem.getJson("platform/submissions/a1/s1.json").attempts[0].score).toBe(8);     // nothing rewritten
    expect(ledgers(ctx)).toHaveLength(1);
    expect(audits(ctx).map(a => [a.action, a.details.from, a.details.to, a.details.moved])).toEqual([["owner.class.transferred", SARA, OMAR, 3]]);
  });
  it("pending grading does not block it: the new teacher inherits it (shown in the preview)", async () => {
    ctx.mem.setJson("platform/submissions/a1/s3.json", { assignmentId: "a1", studentId: "s3", classId: "cA", attempts: [{ attemptNumber: 1, score: 3, totalMarks: 10, percentage: 30, finalized: false }] });
    expect((await preview(ctx, "cA", OMAR)).jsonBody.preview.pendingGrading).toBe(1);
    expect((await post(ctx, "transfer", TRANSFER)).status).toBe(200);
    expect(ctx.mem.getJson("platform/classes/cA.json").ownerId).toBe(OMAR);
  });
  it("an interrupted run is completed by running it again — never moved twice", async () => {
    let failOnce = true;
    const flaky = { ...ctx.deps, mutateJsonWithRetry: (c, name, ...rest) => { if (failOnce && name === "platform/users/s2.json") { failOnce = false; throw new Error("storage down"); } return mutateJsonWithRetry(c, name, ...rest); } };
    const first = await post(ctx, "transfer", TRANSFER, ctx.owner, flaky);
    expect(first.jsonBody.ledger).toMatchObject({ complete: false, students: { moved: 2, failed: 1 }, failedStudentIds: ["s2"] });
    expect(owners(ctx)).toEqual([OMAR, SARA, OMAR, HUDA]);
    const again = await post(ctx, "transfer", TRANSFER);
    expect(again.jsonBody.ledger).toMatchObject({ complete: true, resumed: true, students: { moved: 1, failed: 0 } });
    expect(owners(ctx)).toEqual([OMAR, OMAR, OMAR, HUDA]);
    expect(ctx.mem.getJson("platform/classes/cA.json").ownerHistory).toHaveLength(1);
    expect(ledgers(ctx)).toHaveLength(2);
  });
});

describe("P5-B3a refusals — nothing written", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });
  const untouched = ctx => [JSON.stringify(ctx.mem.getJson("platform/classes/cA.json")), JSON.stringify(owners(ctx))].join("|");
  it("owner only, recent step-up; same teacher, unknown target, stale expected owner, unowned / missing class", async () => {
    const before = untouched(ctx);
    expect((await post(ctx, "transfer", TRANSFER, ctx.sara)).status).toBe(401);
    expect((await post(ctx, "transfer", TRANSFER, ctx.ownerStale)).jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect((await post(ctx, "transfer", { ...TRANSFER, toAccountId: SARA })).jsonBody.code).toBe("SAME_TEACHER");
    expect((await post(ctx, "transfer", { ...TRANSFER, toAccountId: "t_ffffffffffffffff" })).jsonBody.code).toBe("TEACHER_NOT_FOUND");
    expect((await post(ctx, "transfer", { ...TRANSFER, expectedFromAccountId: HUDA })).jsonBody.code).toBe("TRANSFER_STALE");
    expect((await post(ctx, "transfer", { ...TRANSFER, classId: "legacy" })).jsonBody.code).toBe("TRANSFER_STALE");
    expect((await post(ctx, "transfer", { ...TRANSFER, classId: "nope" })).jsonBody.code).toBe("CLASS_NOT_FOUND");
    expect((await post(ctx, "transfer", { ...TRANSFER, classId: "../x" })).jsonBody.code).toBe("CLASS_NOT_FOUND");
    expect((await preview(ctx, "cA", SARA)).jsonBody.code).toBe("SAME_TEACHER");
    expect((await preview(ctx, "legacy", OMAR)).jsonBody.code).toBe("CLASS_NOT_FOUND");
    expect(untouched(ctx)).toBe(before);
    expect(ledgers(ctx)).toEqual([]);
    expect(audits(ctx)).toEqual([]);
  });
  it("a class already moved by someone else meanwhile is refused (never moved twice)", async () => {
    await post(ctx, "transfer", TRANSFER);
    const r = await post(ctx, "transfer", { ...TRANSFER, toAccountId: HUDA });
    expect([r.status, r.jsonBody.code]).toEqual([409, "TRANSFER_STALE"]);
    expect(ctx.mem.getJson("platform/classes/cA.json").ownerId).toBe(OMAR);
  });
});
