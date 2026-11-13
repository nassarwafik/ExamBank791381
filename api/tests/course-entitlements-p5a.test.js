import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P5-A — course entitlements (blueprint §10, owner decisions §19.13). TEST data only.
//   catalog: the owner can archive a course — closed to every teacher and student at once, in every mode (no document = published);
//   entitlement: `resources.courses` of the teacher's revision narrows the courses — applied while the access mode is ENFORCE
//   (legacy / observe: no narrowing, exactly like capabilities); absent = every published course;
//   a student reads a course only while it is published AND their class's teacher is entitled to it (D15: even when that teacher is
//   suspended, what was released stays readable); nothing stored is deleted or changed by a refusal.
// The first block is the FAIL-FIRST proof: on the baseline (before P5-A) an archived course and a non-entitled course are still
// served to the teacher (the «a teacher receives any module» bypass) and to the students.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p5a-course-entitlements-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: content } = await import("../src/functions/learning-content.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { createStudentToken } = await import("../src/lib/student-auth.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa";
const A = "791381", A1 = "791381-m01";
const B = "791381s", B1 = "791381s-m01";
// 899371 P2: a third registered course. It is published (no catalog document) and narrowed like the others; the tests below
// that list EVERY published course name it, the rest keep working on A and B.
const C = "899371";
// AUTO-A2: a fourth registered course («الوحدة الخامسة: الأتمتة»), published like the others; named where EVERY course is listed.
const D = "899271";
const CATALOG = id => "platform/catalog/courses/" + id + ".json";

function setup({ mode = "enforce", courses, preset = "full-teaching" } = {}) {
  resetRevisionCache(); resetOperatorGateCache();
  const mem = createMemoryContainer();
  const deps = { getContainer: () => mem.container };
  const resources = courses === undefined ? {} : { courses };
  const { revision } = buildRevision({ accountId: SARA, presetId: preset, presetVersion: 1, createdBy: "owner:x", ...(courses === undefined ? {} : { resources }) });
  // written directly (the baseline refuses a non-empty `resources` on save; the stored document is what a revision looks like)
  mem.setJson(revisionName(revision.revisionId), { ...revision, resources });
  mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: preset, version: 1 } });
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  mem.setJson("platform/classes/c1.json", { classId: "c1", name: "صف سارة", status: "active", active: true, ownerId: SARA, learningMaterials: [{ courseId: A, visibleModuleIds: [A1] }, { courseId: B, visibleModuleIds: [B1] }] });
  mem.setJson("platform/users/s1.json", { userId: "s1", role: "student", code: "1001", displayName: "طالب", classId: "c1", active: true, archived: false, authVersion: 1 });
  const teacher = { "x-builder-token": recordedManagedToken(mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token };
  const student = { "x-student-token": createStudentToken({ userId: "s1", authVersion: 1, code: "1001", displayName: "x", classId: "c1" }) };
  return { mem, deps, teacher, student };
}
const req = (courseId, moduleId, headers) => ({ method: "GET", url: "https://x", params: { courseId, moduleId }, headers: { get: k => headers[String(k).toLowerCase()] ?? null } });
const read = (ctx, who, courseId = A, moduleId = A1) => content(req(courseId, moduleId, ctx[who]), ctx.deps);

describe("P5-A fail-first — learning content", () => {
  let ctx;
  beforeEach(() => { ctx = setup({ courses: [A] }); });

  it("an ARCHIVED course is not served to the teacher, nor to the students", async () => {
    ctx = setup();                                                     // no entitlement at all: only the catalog decides
    ctx.mem.setJson(CATALOG(A), { schemaVersion: 1, courseId: A, status: "archived" });
    expect((await read(ctx, "teacher")).status).toBe(403);
    expect((await read(ctx, "student")).status).toBe(403);
  });

  it("a course the teacher is NOT entitled to is not served to the teacher (enforce), nor to their students", async () => {
    const t = await read(ctx, "teacher", B, B1);
    expect([t.status, t.jsonBody.code]).toEqual([403, "COURSE_NOT_AVAILABLE"]);
    const s = await read(ctx, "student", B, B1);
    expect([s.status, s.jsonBody.code]).toEqual([403, "COURSE_NOT_AVAILABLE"]);
  });
});

// ── the full matrix ──────────────────────────────────────────────────────────────────────────────────────────────────────
const { handler: study } = await import("../src/functions/learning-study.js");
const { handler: training } = await import("../src/functions/learning-training.js");
const { handler: examItem } = await import("../src/functions/learning-exam-item.js");
const { handler: progress } = await import("../src/functions/learning-progress.js");
const { handler: annotations } = await import("../src/functions/learning-annotations.js");
const { handler: catalog } = await import("../src/functions/learning-materials-catalog.js");
const { handler: materials } = await import("../src/functions/student-learning-materials.js");
const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { handler: ownerAccess } = await import("../src/functions/owner-access.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { loadPageIndex } = await import("../src/lib/learning-progress.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");

const hreq = (method, params, headers, body) => ({ method, url: "https://x", params, headers: { get: k => headers[String(k).toLowerCase()] ?? null }, json: async () => body });
const PAGE = c => loadPageIndex(c).modules[c === A ? A1 : B1][0];
const ITEMS = { schemaVersion: 1, courseId: B, items: { adv1: { moduleId: B1, label: "تدريب", examSnapshot: { examId: "LX", title: "x", status: "published", schemaVersion: 2, sections: [{ id: "s1", title: "س", gradingPolicy: "all", stimuli: {}, questions: [{ examQuestionId: "q2", presentationType: "numericResponse", questionTypeVersion: 1, text: "كم؟", marks: 1, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 32, tolerance: 0 } }] }] }, feedback: {} } } };
const calls = ctx => ({
  content: (who, c = A) => content(req(c, c === A ? A1 : B1, ctx[who]), ctx.deps),
  study: (who, c = A) => study(hreq("GET", { courseId: c }, ctx[who]), ctx.deps),
  trainings: who => training(hreq("GET", {}, ctx[who]), ctx.deps),
  exam: who => examItem(hreq("GET", { courseId: B, itemId: "adv1" }, ctx[who]), { ...ctx.deps, readIndex: () => ITEMS }),
  progressGet: (c = A) => progress(hreq("GET", { courseId: c }, ctx.student), ctx.deps),
  progressPost: (c = A) => progress(hreq("POST", { courseId: c, action: "visit" }, ctx.student, { pageId: PAGE(c) }), ctx.deps),
  notesGet: (c = A) => annotations(hreq("GET", { courseId: c }, ctx.student), ctx.deps),
  catalog: (who = "teacher") => catalog(hreq("GET", {}, ctx[who]), ctx.deps),
  materials: () => materials(hreq("GET", {}, ctx.student), ctx.deps),
  release: (c, modules) => classrooms(hreq("POST", {}, ctx.teacher, { action: "setLearningCourseModules", classId: "c1", courseId: c, moduleIds: modules }), ctx.deps),
  unrelease: c => classrooms(hreq("POST", {}, ctx.teacher, { action: "removeLearningCourse", classId: "c1", courseId: c }), ctx.deps)
});
const ids = r => r.jsonBody.courses.map(c => c.courseId);
const available = r => r.jsonBody.trainings.filter(t => t.available).map(t => t.trainingId);

describe("P5-A the catalog: an archived course is closed to everyone, in every mode", () => {
  for (const mode of ["legacy", "enforce"]) {
    it(`mode ${mode}: teacher (content, study, trainings, catalog, release) and students (content, study, item, new progress, materials)`, async () => {
      const ctx = setup({ mode });
      const c = calls(ctx);
      expect((await c.content("teacher")).status).toBe(200);
      ctx.mem.setJson(CATALOG(A), { schemaVersion: 1, courseId: A, status: "archived" });
      expect((await c.content("teacher")).jsonBody.code).toBe("COURSE_NOT_AVAILABLE");
      expect((await c.study("teacher")).status).toBe(403);
      ctx.mem.setJson(CATALOG(B), { schemaVersion: 1, courseId: B, status: "archived" });
      expect(available(await c.trainings("teacher"))).toEqual([]);                                  // every release course archived
      ctx.mem.setJson(CATALOG(B), { schemaVersion: 1, courseId: B, status: "published" });
      expect(available(await c.trainings("teacher"))).toContain("T01");                             // T01 is also released through B
      expect(ids(await c.catalog())).toEqual([B, C, D]);
      expect((await c.release(A, [A1])).jsonBody.code).toBe("COURSE_NOT_AVAILABLE");
      expect((await c.content("student")).jsonBody.code).toBe("COURSE_NOT_AVAILABLE");
      expect((await c.study("student")).status).toBe(403);
      expect((await c.progressPost()).jsonBody.code).toBe("COURSE_NOT_AVAILABLE");
      expect((await c.materials()).jsonBody.materials.map(m => m.courseId)).toEqual([B]);
      expect((await c.content("student", B)).status).toBe(200);                                     // the other course is untouched
      ctx.mem.setJson(CATALOG(A), { schemaVersion: 1, courseId: A, status: "published" });
      expect((await c.content("student")).status).toBe(200);                                        // published again → open again
    });
  }

  it("a catalog document that cannot be understood counts as archived (fail closed)", async () => {
    const ctx = setup({ mode: "legacy" });
    ctx.mem.setJson(CATALOG(A), { schemaVersion: 1, courseId: A, status: "maybe" });
    expect((await calls(ctx).content("teacher")).status).toBe(403);
  });

  it("history stays: the student's own progress and notes are still readable; nothing stored changes", async () => {
    const ctx = setup({ mode: "legacy" });
    const c = calls(ctx);
    expect((await c.progressPost()).status).toBe(200);
    const before = JSON.stringify(ctx.mem.names("platform/").filter(n => !n.startsWith("platform/catalog/")).map(n => [n, ctx.mem.getJson(n)]));
    ctx.mem.setJson(CATALOG(A), { schemaVersion: 1, courseId: A, status: "archived" });
    expect((await c.progressGet()).status).toBe(200);
    expect((await c.notesGet()).status).toBe(200);
    for (const call of [c.content("student"), c.progressPost(), c.release(A, [A1])]) expect((await call).status).toBe(403);
    expect(JSON.stringify(ctx.mem.names("platform/").filter(n => !n.startsWith("platform/catalog/")).map(n => [n, ctx.mem.getJson(n)]))).toBe(before);
  });
});

describe("P5-A the teacher's entitlement (resources.courses) narrows — while ENFORCING", () => {
  it("legacy / observe: no narrowing yet (exactly like the capabilities)", async () => {
    for (const mode of ["legacy", "observe"]) {
      const ctx = setup({ mode, courses: [A] });
      const c = calls(ctx);
      expect([(await c.content("teacher", B)).status, (await c.content("student", B)).status]).toEqual([200, 200]);
      expect(ids(await c.catalog())).toEqual([A, B, C, D]);
    }
  });

  it("enforce, only A: the teacher's library, trainings, item preview, class release and the students all follow", async () => {
    const ctx = setup({ courses: [A] });
    const c = calls(ctx);
    expect([(await c.content("teacher")).status, (await c.content("teacher", B)).status]).toEqual([200, 403]);
    expect((await c.study("teacher", B)).status).toBe(403);
    expect((await c.exam("teacher")).status).toBe(403);
    expect(ids(await c.catalog())).toEqual([A]);
    const t = available(await c.trainings("teacher"));
    expect(t).toContain("T01");
    expect((await c.release(B, [B1])).jsonBody.code).toBe("COURSE_NOT_AVAILABLE");
    expect((await c.release(A, [A1])).status).toBe(200);
    expect((await c.unrelease(B)).status).toBe(200);                                                // removing is always allowed
    ctx.mem.setJson("platform/classes/c1.json", { ...ctx.mem.getJson("platform/classes/c1.json"), learningMaterials: [{ courseId: A, visibleModuleIds: [A1] }, { courseId: B, visibleModuleIds: [B1] }] });
    expect([(await c.content("student")).status, (await c.content("student", B)).status]).toEqual([200, 403]);
    expect((await c.exam("student")).status).toBe(403);
    expect((await c.materials()).jsonBody.materials.map(m => m.courseId)).toEqual([A]);
  });

  it("no list = every published course; an empty list = none", async () => {
    let ctx = setup();
    expect(ids(await calls(ctx).catalog())).toEqual([A, B, C, D]);
    ctx = setup({ courses: [] });
    expect(ids(await calls(ctx).catalog())).toEqual([]);
    expect((await calls(ctx).content("student")).status).toBe(403);
  });

  it("D15 — a suspended teacher's students keep reading what was released", async () => {
    const ctx = setup({ courses: [A] });
    ctx.mem.setJson(teacherAccountName(SARA), { ...ctx.mem.getJson(teacherAccountName(SARA)), status: "suspended" });
    expect((await calls(ctx).content("student")).status).toBe(200);
    expect((await calls(ctx).content("teacher")).status).toBe(401);                                  // the teacher is out
  });

  // Tadris+ P9-B1 — acceptance test #4 for the ENTITLEMENT (the catalog's version is «history stays» above): narrowing a teacher's
  // courses hides the course and changes nothing stored but the account's own revision pointer; widening it again gives back the
  // student's progress exactly as it was.
  it("acceptance test #4: narrowing the teacher's courses hides B, keeps every stored byte (progress, notes, class), and widening restores it", async () => {
    const ctx = setup({ courses: [A, B] });
    const c = calls(ctx);
    expect((await c.progressPost(B)).status).toBe(200);                                              // the student studied B
    const progressBefore = (await c.progressGet(B)).jsonBody;
    const accountName = teacherAccountName(SARA);
    const wide = ctx.mem.getJson(accountName).accessRevisionId;
    const stored = () => JSON.stringify(ctx.mem.names("platform/").filter(n => n !== accountName && !n.startsWith("platform/access/revisions/")).sort().map(n => [n, ctx.mem.getJson(n)]));
    const before = stored();
    const { revision: narrow } = buildRevision({ accountId: SARA, presetId: "full-teaching", presetVersion: 1, resources: { courses: [A] }, createdBy: "owner:x" });
    ctx.mem.setJson(revisionName(narrow.revisionId), narrow);
    ctx.mem.setJson(accountName, { ...ctx.mem.getJson(accountName), accessRevisionId: narrow.revisionId });
    for (const r of [await c.content("teacher", B), await c.content("student", B), await c.progressPost(B)]) expect([r.status, r.jsonBody.code]).toEqual([403, "COURSE_NOT_AVAILABLE"]);
    expect((await c.materials()).jsonBody.materials.map(m => m.courseId)).toEqual([A]);
    expect((await c.content("student")).status).toBe(200);                                          // A is untouched
    expect((await c.progressGet(B)).jsonBody).toEqual(progressBefore);                              // their history stays readable
    expect((await c.notesGet(B)).status).toBe(200);
    expect(stored()).toBe(before);                                                                  // nothing stored changed
    expect(ctx.mem.getJson("platform/classes/c1.json").learningMaterials.map(m => m.courseId)).toEqual([A, B]);   // the release stays
    ctx.mem.setJson(accountName, { ...ctx.mem.getJson(accountName), accessRevisionId: wide });   // widened again (the owner's rollback)
    expect((await c.content("student", B)).status).toBe(200);
    expect((await c.progressGet(B)).jsonBody).toEqual(progressBefore);
    expect(stored()).toBe(before);
  });

  it("pre-tenancy data (a class with no owner) follows the imported workspace (t_legacy)", async () => {
    const ctx = setup({ mode: "enforce" });
    ctx.mem.setJson("platform/classes/c1.json", { ...ctx.mem.getJson("platform/classes/c1.json"), ownerId: undefined });
    expect((await calls(ctx).content("student", B)).status).toBe(200);                               // no t_legacy account: today's access
    const { revision } = buildRevision({ accountId: "t_legacy", presetId: "legacy-full", presetVersion: 1, resources: { courses: [A] }, createdBy: "owner:x" });
    ctx.mem.setJson(revisionName(revision.revisionId), revision);
    ctx.mem.setJson(teacherAccountName("t_legacy"), { schemaVersion: 1, accountId: "t_legacy", role: "teacher", username: "w.old", displayName: "قديم", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId });
    expect([(await calls(ctx).content("student")).status, (await calls(ctx).content("student", B)).status]).toEqual([200, 403]);
  });

  it("an identity that predates the console (the shared password) is never narrowed", async () => {
    const ctx = setup({ courses: [A] });
    const shared = { "x-builder-token": createBuilderToken("teacher") };
    expect((await content(req(B, B1, shared), ctx.deps)).status).toBe(200);
  });

  it("an access mode that cannot be read counts as enforce (fail closed): the narrowing applies", async () => {
    const ctx = setup({ courses: [A] });
    ctx.mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "?" });
    expect((await calls(ctx).content("student", B)).status).toBe(403);
    expect((await calls(ctx).content("student")).status).toBe(200);
  });

  it("lists fail closed too: with a revision that cannot be trusted, the catalog and the student's materials are EMPTY", async () => {
    const ctx = setup({ courses: [A] });
    resetRevisionCache();
    const acc = ctx.mem.getJson(teacherAccountName(SARA));
    ctx.mem.setJson(revisionName(acc.accessRevisionId), { ...ctx.mem.getJson(revisionName(acc.accessRevisionId)), resources: { courses: ["nope"] } });
    expect((await calls(ctx).materials()).jsonBody.materials).toEqual([]);
    expect(available(await calls(ctx).trainings("student"))).toEqual([]);
  });

  it("a revision that cannot be trusted while enforcing → unavailable (fail closed), never «everything»", async () => {
    const ctx = setup({ courses: [A] });
    resetRevisionCache();
    const acc = ctx.mem.getJson(teacherAccountName(SARA));
    ctx.mem.setJson(revisionName(acc.accessRevisionId), { ...ctx.mem.getJson(revisionName(acc.accessRevisionId)), resources: { courses: ["nope"] } });
    expect((await calls(ctx).content("student", B)).status).toBe(503);
    expect((await calls(ctx).content("student")).status).toBe(503);
  });
});

describe("P5-A the owner's API: catalog status, and courses in assign / history / rollback / effective", () => {
  const OWNER = "own_0011223344556677";
  function withOwner(ctx, stale = false) {
    const now = Date.now();
    ctx.mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER, completedAtMs: now });
    ctx.mem.setJson(ownerAccountName(OWNER), { schemaVersion: 1, accountId: OWNER, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
    const sid = (stale ? "d" : "c").repeat(32);
    ctx.mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: stale ? now - 11 * 60e3 : now });
    return { "x-owner-token": createOwnerToken({ accountId: OWNER, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  const oa = (ctx, h, method, action, body = {}, query = null) => ownerAccess({ method, params: { action }, ...(query ? { query: new URLSearchParams(query) } : {}), headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body }, ctx.deps);

  it("catalog: every course with its status; course-status needs a step-up, refuses bad input, is audited", async () => {
    const ctx = setup({ mode: "legacy" });
    const owner = withOwner(ctx), stale = withOwner(ctx, true);
    expect((await oa(ctx, owner, "GET", "catalog")).jsonBody.courses.map(c => [c.courseId, c.status])).toEqual([[A, "published"], [B, "published"], [C, "published"], [D, "published"]]);
    expect((await oa(ctx, stale, "POST", "course-status", { courseId: A, status: "archived" })).jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect((await oa(ctx, owner, "POST", "course-status", { courseId: "x", status: "archived" })).status).toBe(404);
    expect((await oa(ctx, owner, "POST", "course-status", { courseId: A, status: "gone" })).status).toBe(400);
    expect((await oa(ctx, owner, "POST", "course-status", { courseId: A, status: "archived" })).jsonBody).toEqual({ ok: true, courseId: A, status: "archived" });
    expect((await oa(ctx, owner, "GET", "catalog")).jsonBody.courses.find(c => c.courseId === A).status).toBe("archived");
    expect((await calls(ctx).content("teacher")).status).toBe(403);
    const ev = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).find(e => e.action === "owner.catalog.course-status");
    expect(ev).toMatchObject({ targetId: A, details: { from: "published", to: "archived" } });
  });

  it("assign carries the courses (validated, never corrected); history, effective and rollback follow", async () => {
    const ctx = setup({ mode: "enforce" });
    const owner = withOwner(ctx);
    const acc = () => ctx.mem.getJson(teacherAccountName(SARA));
    const assign = body => oa(ctx, owner, "POST", "assign", { accountId: SARA, presetId: "full-teaching", presetVersion: 1, baseRevisionId: acc().accessRevisionId, ...body });
    expect((await assign({ courses: ["nope"] })).jsonBody.code).toBe("COURSE_UNKNOWN");
    expect((await assign({ courses: [A, A] })).jsonBody.code).toBe("COURSE_DUPLICATE");
    const first = acc().accessRevisionId;
    const r = await assign({ courses: [A] });
    expect([r.status, r.jsonBody.courses]).toEqual([200, [A]]);
    expect(ctx.mem.getJson(revisionName(r.jsonBody.access.revisionId)).resources).toEqual({ courses: [A] });
    expect((await oa(ctx, owner, "GET", "effective", {}, { accountId: SARA })).jsonBody.access.courses).toEqual([A]);
    expect((await calls(ctx).content("teacher", B)).status).toBe(403);
    const h = (await oa(ctx, owner, "GET", "history", {}, { accountId: SARA })).jsonBody.entries;
    expect(h.map(e => e.courses)).toEqual([[A], null]);
    const back = await oa(ctx, owner, "POST", "rollback", { accountId: SARA, revisionId: first, baseRevisionId: r.jsonBody.access.revisionId });
    expect([back.status, back.jsonBody.courses]).toEqual([200, null]);
    expect((await calls(ctx).content("teacher", B)).status).toBe(200);
    const again = await oa(ctx, owner, "POST", "rollback", { accountId: SARA, revisionId: r.jsonBody.access.revisionId, baseRevisionId: back.jsonBody.access.revisionId });
    expect([again.status, again.jsonBody.courses]).toEqual([200, [A]]);                              // restoring brings the courses back
    expect((await calls(ctx).content("teacher", B)).status).toBe(403);
  });
});
