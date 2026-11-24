import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P11-D — «نسخ طلاب صف كامل إلى صف آخر» (owner request: the class of teacher A shows at teacher B too, because its students
// learn with both). The owner copies the students of A's class into a class of B: each one joins with the SAME account as a shared
// class (P11-A). The source class, its teacher and its history are not touched. TEST data only (synthetic 9-digit identities).

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p11d-class-copy-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: ownerClasses } = await import("../src/functions/owner-classes.js");
const { handler: students } = await import("../src/functions/manage-students.js");
const { handler: dashboard } = await import("../src/functions/student-dashboard.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const OWNER_ID = "own_0011223344556677";
const A = "t_00112233445566aa", B = "t_00112233445566bb", C = "t_00112233445566cc";
const S1 = "11111111-1111-1111-1111-111111111111";   // home cA (A)
const S2 = "22222222-2222-2222-2222-222222222222";   // home cA (A)
const S3 = "33333333-3333-3333-3333-333333333333";   // home cA (A), ARCHIVED
const S4 = "44444444-4444-4444-4444-444444444444";   // home cC (C), ADDED to cA
const S5 = "55555555-5555-5555-5555-555555555555";   // home cB (B): B's own student
const S6 = "66666666-6666-6666-6666-666666666666";   // in cA but stamped to teacher C: not on A's roster, never copied
const USER = id => "platform/users/" + id + ".json";
const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const future = () => new Date(Date.now() + 7 * 86400000).toISOString();
const cls = (classId, ownerId, over = {}) => ({ schemaVersion: 1, classId, name: "صف " + classId, grade: "12", schoolYear: "2026-2027", active: true, status: "active", studentIds: [], ownerId, createdAt: "2026-09-01T00:00:00.000Z", ...over });
const student = (userId, classId, ownerId, displayName, identityNumber, over = {}) => ({
  schemaVersion: 3, role: "student", userId, classId, ownerId, displayName, code: identityNumber, identityNumber, active: true, archived: false,
  authVersion: 1, profileRevision: 0, createdAt: "2026-09-02T00:00:00.000Z", ...over
});
const shared = classId => ({ classId, addedAt: "2026-10-01T00:00:00.000Z", addedBy: "owner:" + OWNER_ID });

function setup({ extraShared = [] } = {}) {
  resetOperatorGateCache();
  const mem = createMemoryContainer({
    "platform/classes/cA.json": cls("cA", A, { studentIds: [S1, S2, S3] }),
    "platform/classes/cB.json": cls("cB", B, { studentIds: [S5] }),
    "platform/classes/cBold.json": cls("cBold", B, { active: false, status: "archived" }),
    "platform/classes/cC.json": cls("cC", C, { studentIds: [S4] }),
    [USER(S1)]: student(S1, "cA", A, "ليان سعيد", "300000001", extraShared.length ? { sharedClasses: extraShared.map(shared) } : {}),
    [USER(S2)]: student(S2, "cA", A, "آدم ناصر", "300000002"),
    [USER(S3)]: student(S3, "cA", A, "سما حداد", "300000003", { archived: true, active: false }),
    [USER(S4)]: student(S4, "cC", C, "كريم يوسف", "300000004", { sharedClasses: [shared("cA")] }),
    [USER(S5)]: student(S5, "cB", B, "رنا عمر", "300000005"),
    [USER(S6)]: student(S6, "cA", C, "هالة سمير", "300000006"),
    "platform/assignments/a1.json": { schemaVersion: 2, attemptModelVersion: 2, assignmentId: "a1", classId: "cA", title: "واجب A", status: "published", openAt: "", dueAt: future(), maxAttempts: 1, questionCount: 1, totalMarks: 10, examSnapshot: { title: "x", questions: [] }, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" },
    "platform/assignments/b1.json": { schemaVersion: 2, attemptModelVersion: 2, assignmentId: "b1", classId: "cB", title: "واجب B", status: "published", openAt: "", dueAt: future(), maxAttempts: 1, questionCount: 1, totalMarks: 10, examSnapshot: { title: "x", questions: [] }, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }
  });
  const now = Date.now();
  for (const [id, username] of [[A, "t.sara"], [B, "t.omar"], [C, "t.huda"]]) mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: username, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] });
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const heads = {};
  for (const [name, ago] of [["owner", 0], ["ownerStale", 11 * 60 * 1000]]) {
    const sid = (ago ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - ago });
    heads[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  const base = { getContainer: () => mem.container, container: mem.container, recordAuditEvent: async () => {} };
  const as = sub => ({ ...base, requireBuilderAuth: () => ({ ok: true, user: { sub, am: "multi-user" } }) });
  const asStudent = id => ({ container: mem.container, getContainer: () => mem.container, requireStudentAuth: () => ({ ok: true, user: { sub: id, sv: 1, role: "student" } }), recordGlobalRankMilestone: async () => {}, aggregateRecognition: async () => new Map(), recordAchievementIfEligible: async () => {} });
  return { mem, ...heads, ownerDeps: base, as, asStudent };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const owner = (ctx, action, body, headers = ctx.owner) => ownerClasses({ method: "POST", url: "https://x/api/owner-classes/" + action, params: { action }, headers: hdr(headers), json: async () => body }, ctx.ownerDeps);
const ownerGet = (ctx, action, query, headers = ctx.owner) => ownerClasses({ method: "GET", url: "https://x/api/owner-classes/" + action, params: { action }, query: new URLSearchParams(query), headers: hdr(headers) }, ctx.ownerDeps);
const roster = async (ctx, sub, classId) => (await students({ method: "GET", url: "https://x/api/students?classId=" + classId + "&includeArchived=1", headers: hdr({}) }, ctx.as(sub), quiet)).jsonBody.students;
const userDoc = (ctx, id) => ctx.mem.getJson(USER(id));
const snapshot = ctx => JSON.stringify([...ctx.mem.store.entries()].map(([name, e]) => [name, e.content.toString("utf8")]).sort());
const sharedIds = doc => (doc.sharedClasses || []).map(e => e.classId);

describe("P11-D the owner copies the students of a whole class into another teacher's class", () => {
  it("preview: who would join, who is archived (not copied), who is there already — and nothing is written", async () => {
    const ctx = setup();
    const before = snapshot(ctx);
    const r = await ownerGet(ctx, "copy-students-preview", { fromClassId: "cA", classId: "cB" });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(r.jsonBody.preview).toMatchObject({ fromClassId: "cA", from: A, classId: "cB", to: B, total: 4, toAdd: 3, already: 0, archived: 1, atLimit: 0 });
    expect(snapshot(ctx)).toBe(before);
  });

  it("preview into a NEW class (no classId): every non-archived student would join", async () => {
    const ctx = setup();
    const r = await ownerGet(ctx, "copy-students-preview", { fromClassId: "cA" });
    expect(r.jsonBody.preview).toMatchObject({ classId: "", total: 4, toAdd: 3, archived: 1, already: 0 });
  });

  it("copy: the same accounts join B's class; A's class, the home class and teacher, and A's roster are untouched; audited without identities", async () => {
    const ctx = setup();
    const classA = JSON.stringify(ctx.mem.getJson("platform/classes/cA.json"));
    const r = await owner(ctx, "copy-students", { fromClassId: "cA", classId: "cB" });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, enrolled: 3, already: 0, archived: 1, failed: 0 });
    for (const id of [S1, S2, S4]) expect(sharedIds(userDoc(ctx, id))).toContain("cB");
    expect(sharedIds(userDoc(ctx, S3))).not.toContain("cB");                       // archived: not copied
    expect(sharedIds(userDoc(ctx, S6))).not.toContain("cB");                       // another teacher's student: not copied
    expect(userDoc(ctx, S1)).toMatchObject({ classId: "cA", ownerId: A, authVersion: 1 });   // home class and teacher stay; no session revoked
    expect(userDoc(ctx, S4)).toMatchObject({ classId: "cC", ownerId: C });
    expect(JSON.stringify(ctx.mem.getJson("platform/classes/cA.json"))).toBe(classA);
    // both teachers see the students
    const atB = await roster(ctx, B, "cB");
    expect(atB.map(s => s.userId).sort()).toEqual([S1, S2, S4, S5].sort());
    expect(atB.find(s => s.userId === S1)).toMatchObject({ shared: true });
    expect((await roster(ctx, A, "cA")).map(s => s.userId)).toEqual(expect.arrayContaining([S1, S2]));
    // the student sees the assignments of both classes
    const dash = await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: hdr({}) }, ctx.asStudent(S1), quiet);
    expect(dash.jsonBody.assignments.map(a => a.assignmentId).sort()).toEqual(["a1", "b1"]);
    const audit = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
    expect(audit.find(e => e.action === "owner.students.copy.requested")).toMatchObject({ targetId: "cB", details: { fromClassId: "cA", fromAccountId: A, accountId: B, rows: 3 } });
    expect(JSON.stringify(audit)).not.toContain("300000001");
  });

  it("copying again changes nothing: everyone is already there", async () => {
    const ctx = setup();
    await owner(ctx, "copy-students", { fromClassId: "cA", classId: "cB" });
    const before = snapshot(ctx);
    const again = await owner(ctx, "copy-students", { fromClassId: "cA", classId: "cB" });
    expect(again.jsonBody).toMatchObject({ ok: true, enrolled: 0, already: 3, failed: 0 });
    expect(snapshot(ctx)).toBe(before);
    expect((await ownerGet(ctx, "copy-students-preview", { fromClassId: "cA", classId: "cB" })).jsonBody.preview).toMatchObject({ toAdd: 0, already: 3, archived: 1 });
  });

  it("a student at the shared-class limit is reported, the others join", async () => {
    const ctx = setup({ extraShared: ["x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8"] });
    expect((await ownerGet(ctx, "copy-students-preview", { fromClassId: "cA", classId: "cB" })).jsonBody.preview).toMatchObject({ toAdd: 2, atLimit: 1 });
    const r = await owner(ctx, "copy-students", { fromClassId: "cA", classId: "cB" });
    expect(r.jsonBody).toMatchObject({ enrolled: 2, failed: 1 });
    expect(r.jsonBody.errors).toEqual([expect.objectContaining({ userId: S1, code: "SHARED_LIMIT" })]);
  });

  it("refusals write nothing: no step-up, no owner session, same class, archived target, unknown classes", async () => {
    const ctx = setup();
    const before = snapshot(ctx);
    expect((await owner(ctx, "copy-students", { fromClassId: "cA", classId: "cB" }, ctx.ownerStale)).status).toBe(403);
    expect((await owner(ctx, "copy-students", { fromClassId: "cA", classId: "cB" }, {})).status).toBe(401);
    expect((await ownerGet(ctx, "copy-students-preview", { fromClassId: "cA", classId: "cB" }, {})).status).toBe(401);
    expect((await owner(ctx, "copy-students", { fromClassId: "cA", classId: "cA" })).jsonBody.code).toBe("SAME_CLASS");
    expect((await owner(ctx, "copy-students", { fromClassId: "cA", classId: "cBold" })).jsonBody.code).toBe("CLASS_ARCHIVED");
    expect((await owner(ctx, "copy-students", { fromClassId: "cA", classId: "" })).jsonBody.code).toBe("CLASS_NOT_FOUND");   // a POST never targets "a new class"
    expect((await owner(ctx, "copy-students", { fromClassId: "nope", classId: "cB" })).jsonBody.code).toBe("CLASS_NOT_FOUND");
    expect((await owner(ctx, "copy-students", { fromClassId: "cA", classId: "nope" })).jsonBody.code).toBe("CLASS_NOT_FOUND");
    expect((await ownerGet(ctx, "copy-students-preview", { fromClassId: "cA", classId: "cA" })).jsonBody.code).toBe("SAME_CLASS");
    expect(snapshot(ctx)).toBe(before);
  });
});
