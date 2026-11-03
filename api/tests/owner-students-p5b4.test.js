import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P5-B4 — «يقوم المالك باضافة طلاب المعلم لكي يجهز له الصفحة… المعلم لديه القدرة على تعديل الطلاب حذف طالب اضافة طلاب اخرين».
// TEST data only (synthetic 9-digit identities). The owner adds students to a teacher's ACTIVE class — one, or a whole list after the
// same server preview the teacher gets — with the teacher route's own shared functions; each student is the teacher's (inherits the
// class owner), whom the teacher sees, edits and archives; another teacher never sees them. Owner session + step-up; owner audit AND
// platform audit; temporary passwords only in the answer, never in any audit.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p5b4-owner-students-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: ownerClasses } = await import("../src/functions/owner-classes.js");
const { handler: students } = await import("../src/functions/manage-students.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const OWNER_ID = "own_0011223344556677";
const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";
const cls = (classId, ownerId, over = {}) => ({ schemaVersion: 1, classId, name: "صف " + classId, grade: "11", schoolYear: "2026-2027", active: true, status: "active", studentIds: [], ...(ownerId ? { ownerId } : {}), ...over });

function setup() {
  resetOperatorGateCache();
  const mem = createMemoryContainer({ "platform/classes/cA.json": cls("cA", SARA), "platform/classes/cB.json": cls("cB", OMAR), "platform/classes/cOld.json": cls("cOld", SARA, { active: false, status: "archived" }), "platform/classes/legacy.json": cls("legacy", null) });
  const now = Date.now();
  for (const [id, username] of [[SARA, "t.sara"], [OMAR, "t.omar"]]) mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: username, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] });
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const heads = {};
  for (const [name, ago] of [["owner", 0], ["ownerStale", 11 * 60 * 1000]]) {
    const sid = (ago ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - ago });
    heads[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  const platformAudit = [];
  const deps = { getContainer: () => mem.container, container: mem.container, recordAuditEvent: async (_c, ev) => { platformAudit.push(ev); } };
  const tok = id => ({ "x-builder-token": createManagedTeacherToken({ accountId: id, sid: newTeacherSessionId(), authVersion: 1 }).token });
  return { mem, deps, platformAudit, ...heads, sara: tok(SARA), omar: tok(OMAR) };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const owner = (ctx, action, body, headers = ctx.owner) => ownerClasses({ method: "POST", url: "https://x/api/owner-classes/" + action, params: { action }, headers: hdr(headers), json: async () => body }, ctx.deps);
const teacher = (ctx, headers, body) => students({ method: "POST", url: "https://x/api/students", headers: hdr(headers), json: async () => body }, ctx.deps);
const roster = async (ctx, headers, q = "") => (await students({ method: "GET", url: "https://x/api/students" + q, headers: hdr(headers) }, ctx.deps)).jsonBody.students;
const ownerAudits = ctx => ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
const users = ctx => ctx.mem.names("platform/users/");
const ROWS = [{ firstName: "ليان", familyName: "سعيد", identityNumber: "300000001" }, { firstName: "آدم", familyName: "ناصر", identityNumber: "300000002" }, { firstName: "سما", familyName: "حداد", identityNumber: "300000003" }];

describe("P5-B4 the owner adds one student to a teacher's class", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });
  it("the student is the teacher's: in her roster (not Omar's), stamped with her; the temporary password is in the answer only", async () => {
    const r = await owner(ctx, "add-student", { classId: "cA", firstName: "ليان", familyName: "سعيد", identityNumber: "300000001" });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(201);
    const { student, temporaryPassword } = r.jsonBody;
    expect(student).toMatchObject({ classId: "cA", firstName: "ليان", familyName: "سعيد" });
    expect(typeof temporaryPassword).toBe("string");
    expect(ctx.mem.getJson("platform/users/" + student.userId + ".json").ownerId).toBe(SARA);
    expect((await roster(ctx, ctx.sara, "?classId=cA")).map(s => s.userId)).toEqual([student.userId]);
    expect((await roster(ctx, ctx.omar)).map(s => s.userId)).toEqual([]);
    expect(JSON.stringify([...ownerAudits(ctx), ...ctx.platformAudit])).not.toContain(temporaryPassword);
    expect(ownerAudits(ctx).map(a => [a.actor, a.action, a.details.accountId])).toEqual([["owner:" + OWNER_ID, "owner.student.create", SARA]]);
    expect(ctx.platformAudit.map(a => [a.actor, a.action])).toEqual([["owner:" + OWNER_ID, "student.create"]]);
  });
  it("then the teacher edits, archives and restores that student, and adds others herself", async () => {
    const { student } = (await owner(ctx, "add-student", { classId: "cA", firstName: "ليان", familyName: "سعيد", identityNumber: "300000001" })).jsonBody;
    const doc = ctx.mem.getJson("platform/users/" + student.userId + ".json");
    expect((await teacher(ctx, ctx.sara, { action: "update", userId: student.userId, firstName: "ليان", familyName: "سعيدي", identityNumber: "300000001", profileRevision: doc.profileRevision })).status).toBe(200);
    expect((await teacher(ctx, ctx.sara, { action: "archive", userId: student.userId })).status).toBe(200);
    expect((await teacher(ctx, ctx.sara, { action: "unarchive", userId: student.userId })).status).toBe(200);
    expect((await teacher(ctx, ctx.sara, { action: "create", classId: "cA", firstName: "آدم", familyName: "ناصر", identityNumber: "300000002" })).status).toBe(200);
    expect((await roster(ctx, ctx.sara, "?classId=cA")).length).toBe(2);
    expect((await teacher(ctx, ctx.omar, { action: "archive", userId: student.userId })).status).toBe(404);
  });
  it("the same rules as the teacher's create: a taken identity → 409 and nothing written; invalid input → 400", async () => {
    await owner(ctx, "add-student", { classId: "cA", firstName: "ليان", familyName: "سعيد", identityNumber: "300000001" });
    const before = users(ctx);
    expect((await owner(ctx, "add-student", { classId: "cB", firstName: "س", familyName: "ص", identityNumber: "300000001" })).status).toBe(409);
    expect((await owner(ctx, "add-student", { classId: "cA", firstName: "", familyName: "ص", identityNumber: "300000009" })).status).toBe(400);
    expect((await owner(ctx, "add-student", { classId: "cA", firstName: "س", familyName: "ص", identityNumber: "12a456789" })).status).toBe(400);   // a short number is zero-padded (as for the teacher); a letter is refused
    expect(users(ctx)).toEqual(before);
  });
  it("owner only, with a recent step-up; an archived, unowned or missing class is refused; nothing written", async () => {
    const body = { classId: "cA", firstName: "ليان", familyName: "سعيد", identityNumber: "300000001" };
    expect((await owner(ctx, "add-student", body, ctx.sara)).status).toBe(401);
    expect((await owner(ctx, "add-student", body, ctx.ownerStale)).jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect((await owner(ctx, "add-student", { ...body, classId: "cOld" })).jsonBody.code).toBe("CLASS_ARCHIVED");
    for (const classId of ["legacy", "nope", "../x"]) expect((await owner(ctx, "add-student", { ...body, classId })).jsonBody.code).toBe("CLASS_NOT_FOUND");
    expect(users(ctx)).toEqual([]);
    expect(ownerAudits(ctx)).toEqual([]);
  });
});

describe("P5-B4 the owner imports a list into a teacher's class", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });
  it("preview first (validation only, nothing written), then the import: credentials returned once, students in the teacher's roster", async () => {
    await owner(ctx, "add-student", { classId: "cB", firstName: "قائم", familyName: "سابق", identityNumber: "300000003" });
    const before = users(ctx);
    const p = await owner(ctx, "preview-import", { classId: "cA", students: [...ROWS, { firstName: "", familyName: "x", identityNumber: "1" }] });
    expect([p.status, p.jsonBody.valid, p.jsonBody.duplicates, p.jsonBody.invalid]).toEqual([200, 2, 1, 1]);
    expect(users(ctx)).toEqual(before);
    const r = await owner(ctx, "import-students", { classId: "cA", students: ROWS.slice(0, 2), importId: "owner-import-000000000001" });
    expect([r.status, r.jsonBody.imported, r.jsonBody.failed]).toEqual([200, 2, 0]);
    expect(r.jsonBody.credentials.map(c => c.identityNumber)).toEqual(["300000001", "300000002"]);
    expect(r.jsonBody.credentials.every(c => typeof c.password === "string" && c.password.length > 0)).toBe(true);
    expect((await roster(ctx, ctx.sara, "?classId=cA")).map(s => s.identityNumber).sort()).toEqual(["300000001", "300000002"]);
    const audited = JSON.stringify([...ownerAudits(ctx), ...ctx.platformAudit]);
    for (const c of r.jsonBody.credentials) expect(audited).not.toContain(c.password);
    expect(audited).not.toContain("ليان");
    expect(ownerAudits(ctx).at(-1)).toMatchObject({ action: "owner.student.bulkImport", targetId: "cA", details: { accountId: SARA, createdCount: 2, failedCount: 0 } });
  });
  it("retrying the same import (same key) never creates a student twice", async () => {
    const body = { classId: "cA", students: ROWS.slice(0, 2), importId: "owner-import-000000000002" };
    await owner(ctx, "import-students", body);
    const again = await owner(ctx, "import-students", body);
    expect(again.status).toBe(200);
    expect(users(ctx)).toHaveLength(2);
  });
  it("an empty or oversized list, and an archived class, are refused; nothing written", async () => {
    expect((await owner(ctx, "import-students", { classId: "cA", students: [] })).jsonBody.code).toBe("STUDENTS_EMPTY");
    const many = Array.from({ length: 1001 }, (_, i) => ({ firstName: "ط", familyName: "ت", identityNumber: String(400000000 + i) }));
    expect([400].includes((await owner(ctx, "import-students", { classId: "cA", students: many })).status)).toBe(true);
    expect((await owner(ctx, "import-students", { classId: "cOld", students: ROWS })).jsonBody.code).toBe("CLASS_ARCHIVED");
    expect(users(ctx)).toEqual([]);
  });
});
