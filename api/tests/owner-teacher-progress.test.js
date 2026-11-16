import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";

// Owner teacher dashboard — phase 4: GET /api/owner-teacher-dashboard?view=progress — how far ONE teacher's students have read the
// learning materials and got in the projects, per class. TEST data only. A new view of an owner route (a feature: no fail-first).
// What it must prove: the figures are EXACTLY those of the teacher's own screens (GET /api/learning-class-progress and
// GET /api/project-tracker?resource=summary, called with that teacher's own session), only that teacher's ACTIVE classes, never
// another teacher's; read only; recorded like every view; a storage failure is a 503.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "owner-teacher-progress-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: dashboard } = await import("../src/functions/owner-teacher-dashboard.js");
const { handler: classReading } = await import("../src/functions/learning-class-progress.js");
const { handler: tracker } = await import("../src/functions/project-tracker.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { loadPageIndex, progressDocName } = await import("../src/lib/learning-progress.js");
const { getStorageNamespace, getProjectDefinition } = await import("../src/lib/project-tracker/registry.js");
const { buildClassSnapshot } = await import("../src/lib/project-tracker/service.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb", OWNER = "own_0011223344556677";
const CP = "platform/classes/", UP = "platform/users/";
const T0 = "2026-11-10T08:00:00.000Z";
const COURSE = "791381", PROJECT = "899373";
const INDEX = loadPageIndex(COURSE);
const M01 = "791381-m01", M02 = "791381-m02";
const ns = getStorageNamespace(PROJECT);
const STAGES = getProjectDefinition(PROJECT).stages.map(s => s.stageId);
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });

const room = (classId, owner, students, extra = {}) => ({
  classId, name: "صف " + classId, grade: "10", schoolYear: "2026", active: true, status: "active", ownerId: owner, studentIds: students,
  learningMaterials: [{ courseId: COURSE, visibleModuleIds: [M01, M02] }], programCodes: [PROJECT], createdAt: T0, updatedAt: T0, ...extra
});
const usr = (id, classId) => ({ role: "student", userId: id, classId, displayName: "طالب " + id, code: "C" + id, active: true, archived: false, authVersion: 1 });
const reading = pages => ({ schemaVersion: 1, courses: { [COURSE]: { lastPageId: pages[pages.length - 1], lastModuleId: M01, lastReadAt: T0, pages: Object.fromEntries(pages.map(p => [p, T0])) } } });
const stageProgress = (cid, sid, statuses) => ({ programCode: PROJECT, classId: cid, studentId: sid, stages: Object.fromEntries(statuses.map((st, i) => [STAGES[i], { status: st, ...(st === "approved" ? { approvedAt: T0 } : {}) }])), history: [], updatedAt: T0 });

function setup() {
  resetRevisionCache(); resetOperatorGateCache();
  const s = {};
  s[CP + "cA.json"] = room("cA", SARA, ["a1", "a2", "a3"]);
  s[CP + "cZ.json"] = room("cZ", SARA, ["z1"], { status: "archived", active: false });       // Sara's archived class
  s[CP + "cB.json"] = room("cB", OMAR, ["b1"]);                                              // Omar's class
  for (const [id, c] of [["a1", "cA"], ["a2", "cA"], ["a3", "cA"], ["z1", "cZ"], ["b1", "cB"]]) s[UP + id + ".json"] = usr(id, c);
  s[progressDocName("a1")] = reading(INDEX.modules[M01]);                                     // a1 read all of unit 1
  s[progressDocName("a2")] = reading([INDEX.modules[M01][0], INDEX.modules[M02][0]]);
  s[progressDocName("b1")] = reading(INDEX.modules[M01]);
  for (const c of ["cA", "cZ", "cB"]) s[ns.configName(c)] = buildClassSnapshot(getProjectDefinition(PROJECT), c, T0);
  s[ns.progressName("cA", "a1")] = stageProgress("cA", "a1", ["approved", "approved", "ready_for_review"]);
  s[ns.progressName("cA", "a2")] = stageProgress("cA", "a2", ["in_progress"]);
  s[ns.progressName("cB", "b1")] = stageProgress("cB", "b1", ["approved"]);
  const mem = createMemoryContainer(s);
  for (const [id, name] of [[SARA, "سارة"], [OMAR, "عمر"]]) mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username: "t." + name, displayName: name, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] });
  const now = Date.now();
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER), { schemaVersion: 1, accountId: OWNER, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const sid = "c".repeat(32);
  mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: 0 });
  const owner = { "x-owner-token": createOwnerToken({ accountId: OWNER, sid, authVersion: 1 }, { nowMs: now }).token };
  const deps = { getContainer: () => mem.container, container: mem.container, docCache: null, recordAuditEvent: async () => {} };
  return { mem, deps, owner };
}
const progressOf = (ctx, accountId, extra = "") => dashboard({ method: "GET", url: "https://x/api/owner-teacher-dashboard?accountId=" + accountId + "&view=progress" + extra, headers: hdr(ctx.owner) }, ctx.deps);
const teacherHeaders = (ctx, accountId) => {
  const token = recordedManagedToken(ctx.mem, { accountId, sid: newTeacherSessionId(), authVersion: 1 }).token;
  return hdr({ "x-builder-token": token, authorization: "Bearer " + token });
};

describe("owner teacher dashboard — learning and project progress (view=progress)", () => {
  it("the reading figures are exactly the teacher's own class reading summary", async () => {
    const ctx = setup();
    const r = await progressOf(ctx, SARA);
    expect(r.status).toBe(200);
    expect(r.jsonBody.teacher.accountId).toBe(SARA);
    expect(r.jsonBody.learning.map(l => [l.classId, l.courseId])).toEqual([["cA", COURSE]]);   // not the archived cZ, not Omar's cB
    const own = (await classReading({ method: "GET", url: "https://x", headers: teacherHeaders(ctx, SARA), params: { classId: "cA", courseId: COURSE } }, ctx.deps)).jsonBody;
    expect(own.ok).toBe(true);
    const l = r.jsonBody.learning[0];
    expect(l.modules).toEqual(own.modules);
    expect(l.totalPages).toBe(own.totalPages);
    expect(l.students).toBe(own.students.length);
    const read = own.students.reduce((n, s) => n + s.readPages, 0);
    expect(l.averageRead).toBe(Math.round(read / (own.students.length * own.totalPages) * 100));
    expect(l.startedStudents).toBe(own.students.filter(s => s.readPages > 0).length);
    expect(l.completedStudents).toBe(own.students.filter(s => s.readPages >= own.totalPages).length);
    expect([l.students, l.startedStudents]).toEqual([3, 2]);
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/-l\d\d-p\d\d/);                              // never which pages
  });
  it("the project figures are exactly the teacher's own project summary", async () => {
    const ctx = setup();
    const p = (await progressOf(ctx, SARA)).jsonBody.projects;
    expect(p.map(x => [x.classId, x.projectCode])).toEqual([["cA", PROJECT]]);
    const own = (await tracker({ method: "GET", url: "https://x/api/project-tracker?projectCode=" + PROJECT + "&resource=summary&classId=cA", headers: teacherHeaders(ctx, SARA), json: async () => ({}) }, ctx.deps)).jsonBody;
    expect(own.ok).toBe(true);
    const { studentCount, avgOverall, completedCount, studentsReadyForReview, totalReadyStages, staleCount } = own.summary;
    expect(p[0]).toMatchObject({ studentCount, avgOverall, completedCount, studentsReadyForReview, totalReadyStages, staleCount, title: getProjectDefinition(PROJECT).title });
    expect([studentCount, studentsReadyForReview]).toEqual([3, 1]);
  });
  it("never another teacher's class; an archived class only when it is chosen explicitly", async () => {
    const ctx = setup();
    const omar = (await progressOf(ctx, OMAR)).jsonBody;
    expect([...omar.learning, ...omar.projects].map(x => x.classId)).toEqual(["cB", "cB"]);
    expect(JSON.stringify(omar).includes("a1")).toBe(false);
    const archived = (await progressOf(ctx, SARA, "&classId=cZ")).jsonBody;
    expect(archived.learning.map(x => x.classId)).toEqual(["cZ"]);
    const foreign = (await progressOf(ctx, SARA, "&classId=cB")).jsonBody;                       // Omar's class asked under Sara: nothing
    expect([foreign.learning, foreign.projects]).toEqual([[], []]);
  });
  it("read only: nothing is written but the audit record (scope «progress»)", async () => {
    const ctx = setup();
    const before = ctx.mem.names("").filter(n => !n.startsWith(OWNER_AUDIT_PREFIX) && !n.startsWith("platform/teacher-accounts/")).map(n => n + JSON.stringify(ctx.mem.getJson(n))).sort();
    await progressOf(ctx, SARA);
    const after = ctx.mem.names("").filter(n => !n.startsWith(OWNER_AUDIT_PREFIX) && !n.startsWith("platform/teacher-accounts/")).map(n => n + JSON.stringify(ctx.mem.getJson(n))).sort();
    expect(after).toEqual(before);
    const log = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).filter(e => e.action === "owner.teacher.dashboard.viewed");
    expect(log.map(e => [e.targetId, e.details.scope])).toEqual([[SARA, "progress"]]);
  });
  it("refusals: an unknown view, a malformed class id, no owner session; a storage failure is a 503", async () => {
    const ctx = setup();
    expect((await dashboard({ method: "GET", url: "https://x/api/owner-teacher-dashboard?accountId=" + SARA + "&view=everything", headers: hdr(ctx.owner) }, ctx.deps)).status).toBe(400);
    expect((await progressOf(ctx, SARA, "&classId=" + encodeURIComponent("../x"))).status).toBe(400);
    expect((await dashboard({ method: "GET", url: "https://x/api/owner-teacher-dashboard?accountId=" + SARA + "&view=progress", headers: teacherHeaders(ctx, SARA) }, ctx.deps)).status).toBe(401);
    const down = await dashboard({ method: "GET", url: "https://x/api/owner-teacher-dashboard?accountId=" + SARA + "&view=progress", headers: hdr(ctx.owner) },
      { ...ctx.deps, computeTeacherProgress: async () => { throw new Error("blob read failed"); } });
    expect([down.status, down.jsonBody.ok, "learning" in down.jsonBody]).toEqual([503, false, false]);
  });
});
