import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P5-B2 — owner decision D18 (revised): «انا المالك انشيء الصفوف». TEST data only.
// The owner creates a teacher's classes and manages them (labels, archive / restore / graduate) from the console:
//   owner session only; every change needs a recent step-up and is in the owner audit log;
//   a class is created exactly like the teacher's own (same document, request-key idempotency), owned by THAT teacher, who then
//   sees it and adds students to it; edit and lifecycle are the teacher route's own shared functions (archived class read-only,
//   PENDING_GRADING refused, nothing about students or results touched);
//   only a class owned by an existing teacher account is reachable (another or an unowned class is answered like a missing one).

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p5b2-owner-classes-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: ownerClasses } = await import("../src/functions/owner-classes.js");
const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { handler: students } = await import("../src/functions/manage-students.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const OWNER_ID = "own_0011223344556677";
const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";

function req({ method = "POST", action = "", body = {}, headers = {}, query = null } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, url: "https://x/api/owner-classes" + (action ? "/" + action : ""), params: { action }, ...(query ? { query: new URLSearchParams(query) } : {}), headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}
function setup() {
  resetOperatorGateCache();
  const mem = createMemoryContainer();
  const now = Date.now();
  for (const [id, username] of [[SARA, "t.sara"], [OMAR, "t.omar"]]) mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: username, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] });
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const headers = {};
  for (const [name, ago] of [["owner", 0], ["ownerStale", 11 * 60 * 1000]]) {
    const sid = (ago ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - ago });
    headers[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  mem.setJson("platform/classes/legacy.json", { classId: "legacy", name: "صف قديم", grade: "10", schoolYear: "2025", active: true, studentIds: [] });   // unowned (pre-tenancy)
  const deps = { getContainer: () => mem.container, container: mem.container };
  const teacher = id => ({ "x-builder-token": recordedManagedToken(mem, { accountId: id, sid: newTeacherSessionId(), authVersion: 1 }).token });
  return { mem, deps, ...headers, teacher };
}
const call = (ctx, action, body, headers = ctx.owner) => ownerClasses(req({ action, body, headers }), ctx.deps);
const list = (ctx, accountId, headers = ctx.owner) => ownerClasses(req({ method: "GET", headers, query: { accountId } }), ctx.deps);
const audits = ctx => ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
const teacherClasses = (ctx, id) => classrooms({ method: "GET", url: "https://x/api/classrooms", headers: { get: k => ctx.teacher(id)[String(k).toLowerCase()] ?? null } }, ctx.deps);
const SARA_CLASS = { accountId: SARA, name: "الحادي عشر أ", grade: "11", schoolYear: "2026-2027" };

describe("P5-B2 owner creates a teacher's classes", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("owner only; every change needs a recent step-up; nothing written without it", async () => {
    expect((await call(ctx, "create", SARA_CLASS, {})).status).toBe(401);
    expect((await call(ctx, "create", SARA_CLASS, ctx.teacher(SARA))).status).toBe(401);
    expect((await list(ctx, SARA, {})).status).toBe(401);
    const stale = await call(ctx, "create", SARA_CLASS, ctx.ownerStale);
    expect([stale.status, stale.jsonBody.code]).toEqual([403, "STEP_UP_REQUIRED"]);
    expect(ctx.mem.names("platform/classes/")).toEqual(["platform/classes/legacy.json"]);
  });
  it("the class is the teacher's: same document as the teacher's own create, listed for the owner and the teacher, audited", async () => {
    const r = await call(ctx, "create", SARA_CLASS);
    expect(r.status).toBe(201);
    const { classId } = r.jsonBody.classroom;
    const doc = ctx.mem.getJson("platform/classes/" + classId + ".json");
    expect(doc).toMatchObject({ schemaVersion: 1, classId, ownerId: SARA, name: "الحادي عشر أ", grade: "11", schoolYear: "2026-2027", active: true, studentIds: [], programCodes: [] });
    expect(r.jsonBody.classroom).toMatchObject({ classId, status: "active", studentCount: 0 });
    expect((await list(ctx, SARA)).jsonBody.classes.map(c => c.classId)).toEqual([classId]);
    expect((await list(ctx, OMAR)).jsonBody.classes).toEqual([]);
    expect((await teacherClasses(ctx, SARA)).jsonBody.classes.map(c => c.classId)).toContain(classId);
    expect((await teacherClasses(ctx, OMAR)).jsonBody.classes.map(c => c.classId)).not.toContain(classId);
    expect(audits(ctx)).toEqual([expect.objectContaining({ actor: "owner:" + OWNER_ID, action: "owner.class.created", targetType: "class", targetId: classId, targetLabel: "الحادي عشر أ", details: { accountId: SARA, grade: "11", schoolYear: "2026-2027" } })]);
  });
  it("the teacher then adds a student to the class the owner created", async () => {
    const { classId } = (await call(ctx, "create", SARA_CLASS)).jsonBody.classroom;
    const s = await students({ method: "POST", url: "https://x/api/students", headers: { get: k => ctx.teacher(SARA)[String(k).toLowerCase()] ?? null }, json: async () => ({ action: "create", classId, firstName: "طالب", familyName: "تجريبي", identityNumber: "200000001" }) }, ctx.deps);
    expect(s.status, JSON.stringify(s.jsonBody)).toBe(200);
    expect(s.jsonBody.student.classId).toBe(classId);
  });
  it("a repeated submission (same request key) returns the same class; nothing duplicated", async () => {
    const a = await call(ctx, "create", { ...SARA_CLASS, requestKey: "owner-req-0001" });
    const b = await call(ctx, "create", { ...SARA_CLASS, requestKey: "owner-req-0001" });
    expect([a.status, b.status, b.jsonBody.duplicate]).toEqual([201, 200, true]);
    expect(b.jsonBody.classroom.classId).toBe(a.jsonBody.classroom.classId);
    expect(ctx.mem.names("platform/classes/")).toHaveLength(2);
    expect(audits(ctx)).toHaveLength(1);
  });
  it("an unknown teacher, invalid labels or an invalid request key are refused; nothing written", async () => {
    expect((await call(ctx, "create", { ...SARA_CLASS, accountId: "t_ffffffffffffffff" })).jsonBody.code).toBe("TEACHER_NOT_FOUND");
    expect((await call(ctx, "create", { ...SARA_CLASS, accountId: "../x" })).jsonBody.code).toBe("TEACHER_NOT_FOUND");
    expect((await call(ctx, "create", { ...SARA_CLASS, name: "  " })).jsonBody.code).toBe("CLASS_FIELDS_INVALID");
    expect((await call(ctx, "create", { ...SARA_CLASS, requestKey: "bad key!" })).jsonBody.code).toBe("REQUEST_KEY_INVALID");
    expect((await list(ctx, "t_ffffffffffffffff")).jsonBody.code).toBe("TEACHER_NOT_FOUND");
    expect(ctx.mem.names("platform/classes/")).toEqual(["platform/classes/legacy.json"]);
    expect(audits(ctx)).toEqual([]);
  });
});

describe("P5-B2 owner manages a teacher's class (the teacher route's own rules)", () => {
  let ctx, classId;
  beforeEach(async () => { ctx = setup(); classId = (await call(ctx, "create", SARA_CLASS)).jsonBody.classroom.classId; });

  it("edits only the labels; an unchanged edit writes nothing; audited with the teacher", async () => {
    const r = await call(ctx, "update", { classId, name: "الحادي عشر ب", grade: "11", schoolYear: "2026-2027" });
    expect([r.status, r.jsonBody.changed]).toEqual([200, true]);
    expect(ctx.mem.getJson("platform/classes/" + classId + ".json")).toMatchObject({ name: "الحادي عشر ب", ownerId: SARA, studentIds: [] });
    const again = await call(ctx, "update", { classId, name: "الحادي عشر ب", grade: "11", schoolYear: "2026-2027" });
    expect(again.jsonBody.changed).toBe(false);
    expect(audits(ctx).map(a => a.action)).toEqual(["owner.class.created", "owner.class.update"]);
    expect(audits(ctx)[1].details).toMatchObject({ fields: ["name"], previousName: "الحادي عشر أ", accountId: SARA });
  });
  it("archive → read-only → restore; graduate; each audited", async () => {
    const a = await call(ctx, "archive", { classId });
    expect([a.status, a.jsonBody.status]).toEqual([200, "archived"]);
    expect(ctx.mem.getJson("platform/classes/" + classId + ".json").archivedBy).toBe("owner:" + OWNER_ID);
    expect((await call(ctx, "update", { classId, name: "x", grade: "11", schoolYear: "2026" })).status).toBe(403);
    const u = await call(ctx, "unarchive", { classId });
    expect([u.status, u.jsonBody.status]).toEqual([200, "active"]);
    const g = await call(ctx, "graduate", { classId });
    expect(g.status).toBe(200);
    expect(audits(ctx).map(x => x.action)).toEqual(["owner.class.created", "owner.class.archive", "owner.class.unarchive", "owner.class.graduate"]);
  });
  it("archiving is refused while a current member has work awaiting the teacher (PENDING_GRADING); nothing changes", async () => {
    ctx.mem.setJson("platform/users/s1.json", { userId: "s1", role: "student", active: true, archived: false, classId, displayName: "طالب", authVersion: 1 });
    ctx.mem.setJson("platform/assignments/a1.json", { assignmentId: "a1", classId, status: "published", title: "واجب" });
    ctx.mem.setJson("platform/submissions/a1/s1.json", { assignmentId: "a1", studentId: "s1", attempts: [{ attemptNumber: 1, score: 3, totalMarks: 10, percentage: 30, finalized: false }] });
    const before = JSON.stringify(ctx.mem.getJson("platform/classes/" + classId + ".json"));
    const writes = [];
    const { mutateJsonWithRetry } = cjs("../src/lib/platform-storage.js");
    ctx.deps.mutateJsonWithRetry = (c, name, ...rest) => { writes.push(name); return mutateJsonWithRetry(c, name, ...rest); };
    for (const action of ["archive", "graduate"]) {
      const r = await call(ctx, action, { classId });
      expect([action, r.status, r.jsonBody.code]).toEqual([action, 409, "PENDING_GRADING"]);
    }
    expect(JSON.stringify(ctx.mem.getJson("platform/classes/" + classId + ".json"))).toBe(before);
    expect(writes).toEqual([]);                                                  // refused BEFORE any write: never even briefly archived
  });
  it("only a class owned by an existing teacher account: an unowned or missing class, or a bad id, is answered like a missing one", async () => {
    const before = JSON.stringify([...ctx.mem.store.entries()].filter(([n]) => n.startsWith("platform/classes/")));
    for (const id of ["legacy", "nope", "../auth/x", ""]) for (const action of ["update", "archive", "unarchive", "graduate"]) {
      const r = await call(ctx, action, { classId: id, name: "x", grade: "1", schoolYear: "2026" });
      expect([id, action, r.status, r.jsonBody.code]).toEqual([id, action, 404, "CLASS_NOT_FOUND"]);
    }
    ctx.mem.setJson("platform/classes/ghost.json", { classId: "ghost", name: "صف", ownerId: "t_ffffffffffffffff", active: true });   // owner account gone
    expect((await call(ctx, "archive", { classId: "ghost" })).jsonBody.code).toBe("CLASS_NOT_FOUND");
    expect(JSON.stringify([...ctx.mem.store.entries()].filter(([n]) => n.startsWith("platform/classes/") && n !== "platform/classes/ghost.json"))).toBe(before);
  });
});
