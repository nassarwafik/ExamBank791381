import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P11-C — the SERVICES of a class the owner added a student to (P11-A: student.sharedClasses). Until this phase a shared
// class gave the student its assignments (P11-A) and its conversation (P11-B) only; everything else still asked "the student's
// class" = the home class. Now (docs/enterprise-shared-services-p11c.md):
//   learning materials, trainings, projects — served by the student's OPEN classes in order, home first: the FIRST class that has
//     the course / project serves it (the home class is never overridden; a shared class only ADDS);
//   the live challenge, the number-conversion game, the achievement feed — the shared class counts like the home class;
//   the teacher's analytics and reports — a shared student is counted in the shared class, and only there.
// A class of a THIRD teacher (cC) never gives or shows anything. TEST data only.
// Every test of the first block is FAIL-FIRST evidence: it fails on the baseline (c83c2f02), where the shared class is not asked.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p11c-shared-services-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: materials } = await import("../src/functions/student-learning-materials.js");
const { handler: content } = await import("../src/functions/learning-content.js");
const { handler: training } = await import("../src/functions/learning-training.js");
const { handler: studentTracker } = await import("../src/functions/student-project-tracker.js");
const { handler: liveTeacher } = await import("../src/functions/game-live-session.js");
const { handler: liveStudent } = await import("../src/functions/game-live-session-student.js");
const { handler: numberGame } = await import("../src/functions/game-number-conversion.js");
const { handler: feed } = await import("../src/functions/achievement-feed.js");
const { handler: teacherFeed } = await import("../src/functions/teacher-achievement-feed.js");
const { handler: analytics } = await import("../src/functions/teacher-analytics.js");
const { handler: reports } = await import("../src/functions/reports.js");
const { handler: studentNotifications } = await import("../src/functions/student-notifications.js");
const { handler: classProgress } = await import("../src/functions/learning-class-progress.js");
const { loadProjectEvaluationSources, deriveProjectEvaluationAttention } = await import("../src/lib/project-tracker/evaluation-attention.js");
const { getStorageNamespace } = await import("../src/lib/project-tracker/registry.js");
const { newSessionDoc, sessionDocName } = await import("../src/lib/live-challenge-session-store.js");
const { feedBlobName } = await import("../src/lib/achievement-feed.js");
const { recordEvent } = cjs("../src/lib/notification-events.js");
const { buildRevision, revisionName, resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = cjs("../src/lib/access/access-mode.js");
const { teacherAccountName } = cjs("../src/lib/identity/teacher-accounts.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const A = "t_00112233445566aa", B = "t_00112233445566bb", C = "t_00112233445566cc";
const S = "11111111-1111-1111-1111-111111111111";      // home: cA (teacher A); shares cB (teacher B)
const S2 = "22222222-2222-2222-2222-222222222222";     // teacher B's own student (cB)
const S3 = "33333333-3333-3333-3333-333333333333";     // teacher C's own student (cC)
const COURSE = "791381", M01 = "791381-m01", M02 = "791381-m02";
const CODE = "794589", NS = getStorageNamespace(CODE);
const USER = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const course = (...visible) => [{ courseId: COURSE, visibleModuleIds: visible }];
const cls = (classId, ownerId, over = {}) => ({ schemaVersion: 1, classId, name: "صف " + classId, grade: "12", schoolYear: "2026-2027", active: true, status: "active", studentIds: [], ownerId, createdAt: "2026-09-01T00:00:00.000Z", ...over });
const student = (userId, classId, ownerId, displayName, over = {}) => ({
  schemaVersion: 3, role: "student", userId, classId, ownerId, displayName, code: "C" + userId.slice(0, 4), identityNumber: "3000000" + userId.slice(0, 2),
  active: true, archived: false, authVersion: 1, createdAt: "2026-09-02T00:00:00.000Z", lastLoginAt: "2026-10-01T00:00:00.000Z", ...over
});
const sharedIn = (...ids) => ({ sharedClasses: ids.map(classId => ({ classId, addedAt: "2026-10-01T00:00:00.000Z", addedBy: "owner:own_0011223344556677" })) });
const CHALLENGE = {
  kind: "live-challenge", schemaVersion: 1, savedAt: "2026-01-01T00:00:00.000Z",
  challenge: { schemaVersion: 1, challengeId: "c1", title: "تحدّي", courseId: COURSE, questions: [{ source: { kind: "manual" }, question: { examQuestionId: "q1", presentationType: "multipleChoice", prompt: "2+2?", options: ["3", "4"], correctOptionIndex: 1, answer: "4" } }] }
};
const assignment = (assignmentId, classId) => ({
  schemaVersion: 2, attemptModelVersion: 2, assignmentId, classId, title: "واجب " + assignmentId, status: "published", openAt: "", dueAt: "", maxAttempts: 1, questionCount: 1, totalMarks: 10,
  examSnapshot: { title: "امتحان", questions: [] }, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z"
});
const submission = (assignmentId, studentId, percentage) => ({ assignmentId, studentId, attempts: [{ attemptNumber: 1, status: "submitted", submittedAt: "2026-10-05T08:00:00.000Z", percentage, score: percentage / 10, totalMarks: 10, gradingStatus: "final" }] });
const post = (classId, postId, studentId, name) => ({ schemaVersion: 2, eventType: "project_complete", postId, classId, studentId, studentDisplayName: name, createdAt: "2026-10-06T08:00:00.000Z", shareWithClass: true, reactions: {}, project: { projectCode: CODE, title: "مشروع" } });

/**
 * cA (teacher A, the student's home), cB (teacher B, shared), cC (teacher C, never the student's). `a` / `b` / `c`: what each class
 * document carries on top (materials, projects, status); `shared`: the classes S shares (default cB).
 */
function setup({ a = {}, b = {}, c = {}, shared = ["cB"], extra = {} } = {}) {
  resetRevisionCache(); resetOperatorGateCache();
  const mem = createMemoryContainer({
    [CLS("cA")]: cls("cA", A, a), [CLS("cB")]: cls("cB", B, b), [CLS("cC")]: cls("cC", C, c),
    [USER(S)]: student(S, "cA", A, "ليان سعيد", shared.length ? sharedIn(...shared) : {}),
    [USER(S2)]: student(S2, "cB", B, "كريم ناصر"),
    [USER(S3)]: student(S3, "cC", C, "هدى علي"),
    ...extra
  });
  const base = { container: mem.container, getContainer: () => mem.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const noTeacher = () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } });
  const as = sub => ({ ...base, requireBuilderAuth: () => ({ ok: true, user: { sub, am: "multi-user" } }) });
  const asStudent = (id = S) => ({ ...base, requireBuilderAuth: noTeacher, requireStudentAuth: () => ({ ok: true, user: { sub: id, sv: 1, role: "student" } }) });
  return { mem, as, asStudent };
}
const hdr = { get: () => null };
const listMaterials = (ctx, id) => materials({ method: "GET", url: "https://x/api/student-learning-materials", headers: hdr }, ctx.asStudent(id));
const readModule = (ctx, moduleId = M01, id) => content({ method: "GET", url: "https://x", headers: hdr, params: { courseId: COURSE, moduleId } }, ctx.asStudent(id));
const train = ctx => training({ method: "POST", url: "https://x/api/learning-training", headers: hdr, params: { trainingId: "T01", action: "submit" }, json: async () => ({ answers: {} }) }, ctx.asStudent());
const myProjects = (ctx, id) => studentTracker({ method: "GET", url: "https://x/api/student-project-tracker", headers: hdr, json: async () => ({}) }, ctx.asStudent(id));
const markStage = (ctx, stageId) => studentTracker({ method: "POST", url: "https://x/api/student-project-tracker", headers: hdr, json: async () => ({ projectCode: CODE, stageIds: [stageId], mark: true }) }, ctx.asStudent());
const live = (ctx, sub, action, body) => liveTeacher({ method: "POST", params: { action }, headers: hdr, json: async () => body }, ctx.as(sub));
const play = (ctx, action, body, id) => liveStudent({ method: "POST", params: { action }, headers: hdr, json: async () => body }, ctx.asStudent(id));
const game = (ctx, id) => numberGame({ method: "GET", url: "https://x/api/game-number-conversion", headers: hdr, params: {} }, ctx.asStudent(id));
const myFeed = (ctx, id) => feed({ method: "GET", url: "https://x/api/achievement-feed", headers: hdr }, ctx.asStudent(id), quiet);
const react = (ctx, postId, id) => feed({ method: "POST", url: "https://x/api/achievement-feed", headers: hdr, json: async () => ({ action: "react", postId, reaction: "heart" }) }, ctx.asStudent(id), quiet);
const tFeed = (ctx, sub, query) => teacherFeed({ method: "GET", url: "https://x/api/teacher-achievement-feed?" + query, headers: hdr }, ctx.as(sub), quiet);
const tAnalytics = (ctx, sub, query = "") => analytics({ method: "GET", url: "https://x/api/teacher-analytics" + (query ? "?" + query : ""), headers: hdr }, ctx.as(sub), quiet);
const report = (ctx, sub, query) => reports({ method: "GET", url: "https://x/api/reports?" + query, headers: hdr }, ctx.as(sub), quiet);
const bell = (ctx, id) => studentNotifications({ method: "GET", url: "https://x/api/student-notifications?view=notifications", headers: hdr }, ctx.asStudent(id), quiet);
const snapshot = ctx => JSON.stringify([...ctx.mem.store.entries()].map(([name, e]) => [name, e.content.toString("utf8")]).sort());
const room = (classId, teacherId, participants, joinCode = "K7MX4P") => newSessionDoc({ joinCode, teacherId, challengeId: "c1", challengeTitle: "تحدّي", classId, participants, challengeSnapshot: CHALLENGE.challenge, now: "2026-10-01T00:00:00.000Z" });

describe("P11-C fail-first — the learning materials of a shared class", () => {
  it("the student's list offers the course of the class they share (baseline: an empty list)", async () => {
    const ctx = setup({ b: { learningMaterials: course(M01, M02) } });
    const r = await listMaterials(ctx);
    expect(r.status).toBe(200);
    expect(r.jsonBody.materials.map(m => m.courseId)).toEqual([COURSE]);
    expect(r.jsonBody.materials[0].modules.map(m => m.moduleId)).toEqual([M01, M02]);
  });
  it("a module published to the shared class is served (baseline: refused)", async () => {
    const ctx = setup({ b: { learningMaterials: course(M01) } });
    const r = await readModule(ctx);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, courseId: COURSE });
    expect(r.jsonBody.module).toBeTruthy();
  });
  it("a training released by the shared class's module is open (baseline: refused)", async () => {
    const ctx = setup({ b: { learningMaterials: course(M01) } });
    const r = await train(ctx);
    expect(r.status).toBe(200);
    expect(r.jsonBody.result).toBeTruthy();
  });
  it("the bell announces a module the shared class publishes (baseline: hidden)", async () => {
    const ctx = setup({ b: { learningMaterials: course(M01) } });
    await recordEvent(ctx.mem.container, { scope: "class", classId: "cB", type: "learning_module_published", dedupeKey: "module:" + COURSE + ":" + M01 + ":x", data: { courseId: COURSE, moduleId: M01 } });
    const items = (await bell(ctx)).jsonBody.items.filter(i => i.type === "learning_module_published");
    expect(items.map(i => i.moduleId)).toEqual([M01]);
  });
});

describe("P11-C fail-first — the projects of a shared class", () => {
  it("the student sees the project the shared class runs and marks a stage in THAT class (baseline: not enrolled)", async () => {
    const ctx = setup({ b: { programCodes: [CODE] } });
    const r = await myProjects(ctx);
    expect(r.jsonBody).toMatchObject({ ok: true, enrolled: true });
    expect(r.jsonBody.projects.map(p => p.projectCode)).toEqual([CODE]);
    const stageId = r.jsonBody.projects[0].stages.find(s => s.active !== false).stageId;
    const m = await markStage(ctx, stageId);
    expect(m.status).toBe(200);
    expect(m.jsonBody.results[0]).toMatchObject({ stageId, ok: true });
    expect(ctx.mem.getJson(NS.progressName("cB", S)).stages[stageId].status).toBe("approved");
    expect(ctx.mem.getJson(NS.progressName("cA", S))).toBeNull();
  });
  it("teacher B's evaluation follow-up of the project counts the shared student's work (baseline: left out)", async () => {
    const ctx = setup({ b: { programCodes: [CODE] } });
    const stageId = (await myProjects(ctx)).jsonBody.projects[0].stages.find(s => s.active !== false).stageId;
    await markStage(ctx, stageId);
    const sources = await loadProjectEvaluationSources(ctx.mem.container, [ctx.mem.getJson(CLS("cB"))]);
    const users = [ctx.mem.getJson(USER(S)), ctx.mem.getJson(USER(S2)), ctx.mem.getJson(USER(S3))];
    const out = deriveProjectEvaluationAttention({ users, sources });
    expect(out.skipped).toEqual([]);
    expect(out.attention.map(r => r.studentId).sort()).toEqual([S, S2]);
    expect(out.attention.every(r => r.classId === "cB")).toBe(true);
  });
  it("teacher B's class reading of the course lists the shared student (baseline: their own students only)", async () => {
    const ctx = setup({ b: { learningMaterials: course(M01), studentIds: [S, S2] } });
    const r = await classProgress({ method: "GET", url: "https://x", headers: hdr, params: { classId: "cB", courseId: COURSE } }, ctx.as(B), quiet);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.jsonBody)).toContain("ليان سعيد");
    expect(JSON.stringify(r.jsonBody)).toContain("كريم ناصر");
    // …and teacher C, whose class the student is not in, never does (the student's id written into cC's index by mistake)
    ctx.mem.setJson(CLS("cC"), cls("cC", C, { learningMaterials: course(M01), studentIds: [S, S3] }));
    const other = await classProgress({ method: "GET", url: "https://x", headers: hdr, params: { classId: "cC", courseId: COURSE } }, ctx.as(C), quiet);
    expect(JSON.stringify(other.jsonBody)).not.toContain("ليان سعيد");
  });
  it("teacher B's class roster of the reports lists the shared student (baseline: their own students only)", async () => {
    const ctx = setup({ b: { programCodes: [CODE] } });
    const r = await report(ctx, B, "type=classStudents&classId=cB");
    expect(r.jsonBody.students.map(s => s.studentId).sort()).toEqual([S, S2]);
  });
});

describe("P11-C fail-first — games and the achievement feed of a shared class", () => {
  it("teacher B opens a live room with the shared student (baseline: «أحد الطلاب المختارين غير صالح»)", async () => {
    const ctx = setup({ extra: { ["platform/games/live-challenge/" + B + "/c1.json"]: CHALLENGE } });
    const r = await live(ctx, B, "create", { challengeId: "c1", classId: "cB", studentIds: [S, S2] });
    expect(r.status).toBe(200);
    expect(r.jsonBody.session.participants).toHaveLength(2);
  });
  it("the shared student reads and joins the room of the shared class (baseline: NOT_IN_CLASS)", async () => {
    const doc = room("cB", B, [{ studentId: S, displayName: "ليان" }, { studentId: S2, displayName: "كريم" }]);
    const ctx = setup({ extra: { [sessionDocName(doc.joinCode)]: doc } });
    expect((await play(ctx, "get", { joinCode: doc.joinCode })).status).toBe(200);
    expect((await play(ctx, "join", { joinCode: doc.joinCode })).status).toBe(200);
  });
  it("the number-conversion game opens through the shared class when the home class is archived (baseline: no class)", async () => {
    const ctx = setup({ a: { status: "archived", active: false } });
    expect((await game(ctx)).status).toBe(200);
  });
  it("the student sees the shared class's feed beside the home feed and reacts there (baseline: the home feed only)", async () => {
    const ctx = setup({ extra: { [feedBlobName("cA", "p_home_" + S)]: post("cA", "p_home_" + S, S, "ليان"), [feedBlobName("cB", "p_b_" + S2)]: post("cB", "p_b_" + S2, S2, "كريم") } });
    const r = await myFeed(ctx);
    expect(r.jsonBody.posts.map(p => p.postId).sort()).toEqual(["p_b_" + S2, "p_home_" + S]);
    expect(r.jsonBody.posts.find(p => p.postId === "p_b_" + S2).className).toBe("صف cB");
    const done = await react(ctx, "p_b_" + S2);
    expect(done.status).toBe(200);
    expect(ctx.mem.getJson(feedBlobName("cB", "p_b_" + S2)).reactions.heart).toEqual([S]);
  });
  it("teacher B filters their feed by the shared student (baseline: «الطالب غير موجود في هذا الصف»)", async () => {
    const ctx = setup({ extra: { [feedBlobName("cB", "p_b_" + S)]: post("cB", "p_b_" + S, S, "ليان") } });
    const r = await tFeed(ctx, B, "classId=cB&studentId=" + S);
    expect(r.status).toBe(200);
    expect(r.jsonBody.posts.map(p => p.postId)).toEqual(["p_b_" + S]);
  });
});

describe("P11-C fail-first — the teacher's analytics and reports count the shared student in the shared class", () => {
  const graded = () => ({ extra: {
    "platform/assignments/a1.json": assignment("a1", "cA"), "platform/assignments/b1.json": assignment("b1", "cB"),
    ["platform/submissions/a1/" + S + ".json"]: submission("a1", S, 40),
    ["platform/submissions/b1/" + S + ".json"]: submission("b1", S, 90), ["platform/submissions/b1/" + S2 + ".json"]: submission("b1", S2, 70)
  } });
  it("class analytics of cB: two students, two expected submissions, the shared student's mark included (baseline: one student)", async () => {
    const ctx = setup(graded());
    const r = await tAnalytics(ctx, B, "classId=cB");
    expect(r.status).toBe(200);
    expect(r.jsonBody.kpis).toMatchObject({ activeStudents: 2, publishedAssignments: 1, expectedSubmissions: 2, submissions: 2, average: 80, highest: 90 });
    expect(r.jsonBody.students.map(s => s.userId).sort()).toEqual([S, S2]);
  });
  it("the student scope of cB opens for the shared student and shows cB's work only (baseline: 400)", async () => {
    const ctx = setup(graded());
    const r = await tAnalytics(ctx, B, "classId=cB&studentId=" + S);
    expect(r.status).toBe(200);
    expect(r.jsonBody.kpis).toMatchObject({ activeStudents: 1, publishedAssignments: 1, submissions: 1, average: 90 });
    expect(JSON.stringify(r.jsonBody)).not.toContain("واجب a1");
  });
  it("the student report of the shared class (baseline: 404)", async () => {
    const ctx = setup({ ...graded(), b: { programCodes: [CODE] } });
    const r = await report(ctx, B, "type=student&classId=cB&studentId=" + S);
    expect(r.status).toBe(200);
    expect(r.jsonBody.student).toMatchObject({ studentId: S, classId: "cB", className: "صف cB" });
    expect(r.jsonBody.academic).toMatchObject({ assessmentCount: 1, submittedCount: 1, average: 90 });
    expect(r.jsonBody.projects.map(p => p.projectCode)).toEqual([CODE]);
  });
});

describe("P11-C the serving rule: the home class first, a shared class only adds", () => {
  it("lib: open classes in order (home, then shared as added); the first that has the thing serves it", async () => {
    const ctx = setup({ a: { learningMaterials: course(M02) }, b: { learningMaterials: course(M01) }, c: { learningMaterials: course(M01) }, shared: ["cB", "cC"] });
    const { studentClasses, servingClass, offersCourse, studentOfClass } = cjs("../src/lib/student-classes.js");   // new in P11-C
    const load = name => Promise.resolve(ctx.mem.getJson(name));
    const classes = await studentClasses(ctx.mem.getJson(USER(S)), load);
    expect(classes.open.map(c => c.classId)).toEqual(["cA", "cB", "cC"]);
    expect(servingClass(classes, offersCourse(COURSE)).classId).toBe("cA");
    expect(servingClass(classes, c => c.classId === "cC").classId).toBe("cC");
    expect(servingClass(classes, () => false)).toBeNull();
    // a missing class document gives nothing; an archived class is not open
    ctx.mem.setJson(CLS("cB"), cls("cB", B, { status: "archived", active: false }));
    ctx.mem.store.delete(CLS("cC"));
    const after = await studentClasses(ctx.mem.getJson(USER(S)), load);
    expect(after.open.map(c => c.classId)).toEqual(["cA"]);
    expect(after.shared.map(c => [c.classId, c.archived])).toEqual([["cB", true]]);
    // the student AS A STUDENT of a shared class: that class's teacher, never the home teacher's stamp
    expect(studentOfClass(ctx.mem.getJson(USER(S)), cls("cB", B)).ownerId).toBe(B);
    expect("ownerId" in studentOfClass(ctx.mem.getJson(USER(S)), cls("cB", ""))).toBe(false);
  });
  it("a course BOTH classes offer is the home class's: its modules only, never a merge", async () => {
    const ctx = setup({ a: { learningMaterials: course(M02) }, b: { learningMaterials: course(M01) } });
    const list = await listMaterials(ctx);
    expect(list.jsonBody.materials).toHaveLength(1);
    expect(list.jsonBody.materials[0].modules.map(m => m.moduleId)).toEqual([M02]);
    expect((await readModule(ctx, M02)).status).toBe(200);
    expect((await readModule(ctx, M01)).status).not.toBe(200);       // published in cB only — but cA serves this course
    expect((await train(ctx)).status).not.toBe(200);
  });
  it("…and the bell does not announce the shared class's module of that course", async () => {
    const ctx = setup({ a: { learningMaterials: course(M02) }, b: { learningMaterials: course(M01) } });
    await recordEvent(ctx.mem.container, { scope: "class", classId: "cB", type: "learning_module_published", dedupeKey: "module:" + COURSE + ":" + M01 + ":x", data: { courseId: COURSE, moduleId: M01 } });
    expect((await bell(ctx)).jsonBody.items.filter(i => i.type === "learning_module_published")).toEqual([]);
  });
  it("the home class attached the course but published nothing: it does not offer it, so the shared class serves", async () => {
    const ctx = setup({ a: { learningMaterials: course() }, b: { learningMaterials: course(M01) } });
    expect((await readModule(ctx)).status).toBe(200);
  });
  it("a project BOTH classes run is the home class's: the work is stored there", async () => {
    const ctx = setup({ a: { programCodes: [CODE] }, b: { programCodes: [CODE] } });
    const r = await myProjects(ctx);
    expect(r.jsonBody.projects).toHaveLength(1);
    expect(r.jsonBody.className).toBe("صف cA");
    const stageId = r.jsonBody.projects[0].stages.find(s => s.active !== false).stageId;
    expect((await markStage(ctx, stageId)).status).toBe(200);
    expect(ctx.mem.getJson(NS.progressName("cA", S)).stages[stageId].status).toBe("approved");
    expect(ctx.mem.getJson(NS.progressName("cB", S))).toBeNull();
  });
  it("an archived home class keeps its project as a read-only record only where no open class runs it", async () => {
    const ctx = setup({ a: { programCodes: [CODE], status: "archived", active: false }, b: { programCodes: [CODE] } });
    const r = await myProjects(ctx);
    expect(r.jsonBody.projects).toHaveLength(1);
    expect(r.jsonBody.projects[0]).toMatchObject({ className: "صف cB" });
    expect(r.jsonBody.projects[0].readOnly).toBeUndefined();
    const only = setup({ a: { programCodes: [CODE], status: "archived", active: false } });
    expect((await myProjects(only)).jsonBody.projects[0]).toMatchObject({ className: "صف cA", readOnly: true });
  });
});

describe("P11-C what a shared class never gives", () => {
  it("a hidden module, an archived shared class, a class the student left: refused", async () => {
    const hidden = setup({ b: { learningMaterials: course(M02) } });
    expect((await readModule(hidden, M01)).status).not.toBe(200);
    const archived = setup({ b: { learningMaterials: course(M01), status: "archived", active: false } });
    expect((await readModule(archived)).status).not.toBe(200);
    expect((await listMaterials(archived)).jsonBody.materials).toEqual([]);
    const left = setup({ b: { learningMaterials: course(M01), programCodes: [CODE] }, shared: [] });
    expect((await readModule(left)).status).not.toBe(200);
    expect((await listMaterials(left)).jsonBody.materials).toEqual([]);
    expect((await myProjects(left)).jsonBody).toMatchObject({ enrolled: false, projects: [] });
  });
  it("a class of a third teacher gives nothing: no course, no project, no feed post, no reaction, no room", async () => {
    const doc = room("cC", C, [{ studentId: S, displayName: "ليان" }, { studentId: S3, displayName: "هدى" }]);
    const ctx = setup({ c: { learningMaterials: course(M01), programCodes: [CODE] }, extra: { [feedBlobName("cC", "p_c_" + S3)]: post("cC", "p_c_" + S3, S3, "هدى"), [sessionDocName(doc.joinCode)]: doc, ["platform/games/live-challenge/" + C + "/c1.json"]: CHALLENGE } });
    const before = snapshot(ctx);
    expect((await readModule(ctx)).status).not.toBe(200);
    expect((await listMaterials(ctx)).jsonBody.materials).toEqual([]);
    expect((await myProjects(ctx)).jsonBody.enrolled).toBe(false);
    expect((await myFeed(ctx)).jsonBody.posts).toEqual([]);
    expect((await react(ctx, "p_c_" + S3)).status).toBe(404);
    expect((await play(ctx, "get", { joinCode: doc.joinCode })).status).toBe(403);       // on the list by mistake, yet not of the class
    expect((await live(ctx, C, "create", { challengeId: "c1", classId: "cC", studentIds: [S] })).status).toBe(400);
    expect(snapshot(ctx)).toBe(before);
  });
  it("a student of one class costs the one class read of before (no shared class is looked for)", async () => {
    const ctx = setup({ a: { learningMaterials: course(M01) }, shared: [] });
    const reads = [];
    const deps = { ...ctx.asStudent(), downloadJsonOrNull: async (_c, name) => { reads.push(name); return ctx.mem.getJson(name); } };
    await materials({ method: "GET", url: "https://x/api/student-learning-materials", headers: hdr }, deps);
    expect(reads.filter(n => n.startsWith("platform/classes/"))).toEqual([CLS("cA")]);
  });
});

describe("P11-C the feed across classes", () => {
  it("an archived home class stays a read-only record while the shared class still takes reactions", async () => {
    const ctx = setup({ a: { status: "archived", active: false }, extra: { [feedBlobName("cA", "p_a_" + S3)]: post("cA", "p_a_" + S3, S3, "زميل"), [feedBlobName("cB", "p_b_" + S2)]: post("cB", "p_b_" + S2, S2, "كريم") } });
    const r = await myFeed(ctx);
    expect(r.jsonBody.readOnly).toBeUndefined();
    expect(r.jsonBody.posts.find(p => p.postId === "p_a_" + S3).readOnly).toBe(true);
    expect((await react(ctx, "p_a_" + S3)).status).toBe(403);
    expect((await react(ctx, "p_b_" + S2)).status).toBe(200);
  });
  it("a student of one class gets the response of before: no class name on a post", async () => {
    const ctx = setup({ shared: [], extra: { [feedBlobName("cA", "p_home_" + S)]: post("cA", "p_home_" + S, S, "ليان") } });
    const r = await myFeed(ctx);
    expect(r.jsonBody.posts).toHaveLength(1);
    expect("className" in r.jsonBody.posts[0]).toBe(false);
  });
});

describe("P11-C analytics and reports keep each teacher to their own class", () => {
  const graded = () => ({ extra: {
    "platform/assignments/a1.json": assignment("a1", "cA"), "platform/assignments/b1.json": assignment("b1", "cB"),
    ["platform/submissions/a1/" + S + ".json"]: submission("a1", S, 40),
    ["platform/submissions/b1/" + S + ".json"]: submission("b1", S, 90), ["platform/submissions/b1/" + S2 + ".json"]: submission("b1", S2, 70)
  } });
  it("the home teacher's analytics are unchanged: the home class's work only", async () => {
    const ctx = setup(graded());
    const r = await tAnalytics(ctx, A);
    expect(r.jsonBody.kpis).toMatchObject({ activeStudents: 1, publishedAssignments: 1, expectedSubmissions: 1, submissions: 1, average: 40 });
    expect(JSON.stringify(r.jsonBody)).not.toContain("واجب b1");
  });
  it("a third teacher's analytics never see the student; the student scope of a class they are not in is refused", async () => {
    const ctx = setup(graded());
    expect((await tAnalytics(ctx, C)).jsonBody.students.map(s => s.userId)).toEqual([S3]);
    expect((await tAnalytics(ctx, C, "classId=cC&studentId=" + S)).status).toBe(400);
    expect((await tAnalytics(ctx, C, "classId=cB")).status).toBe(404);
  });
  it("a teacher who has BOTH classes of a student counts the student once in the global scope", async () => {
    const ctx = setup(graded());
    ctx.mem.setJson(CLS("cB"), cls("cB", A));
    ctx.mem.setJson(USER(S2), student(S2, "cB", A, "كريم ناصر"));
    const r = await tAnalytics(ctx, A);
    expect(r.jsonBody.kpis).toMatchObject({ activeStudents: 2, publishedAssignments: 2, expectedSubmissions: 3, submissions: 3 });
    expect(r.jsonBody.students.map(s => s.userId).sort()).toEqual([S, S2]);
  });
  it("the student report: the home teacher still gets the home class; a third teacher, and a class the student is not in, get 404", async () => {
    const ctx = setup(graded());
    const home = await report(ctx, A, "type=student&studentId=" + S);
    expect(home.jsonBody.student).toMatchObject({ classId: "cA" });
    expect(home.jsonBody.academic).toMatchObject({ assessmentCount: 1, average: 40 });
    expect((await report(ctx, A, "type=student&classId=cA&studentId=" + S)).jsonBody.student.classId).toBe("cA");
    expect((await report(ctx, B, "type=student&studentId=" + S)).status).toBe(404);              // no class named: not B's own student
    expect((await report(ctx, C, "type=student&classId=cC&studentId=" + S)).status).toBe(404);
    expect((await report(ctx, C, "type=student&classId=cB&studentId=" + S)).status).toBe(404);   // cB is not C's class
    expect((await report(ctx, B, "type=student&classId=cB&studentId=" + S3)).status).toBe(404);  // not a student of cB
  });
});

describe("P11-C more guards of the rule", () => {
  it("the feed of an ARCHIVED shared class is not listed and takes no reaction", async () => {
    const ctx = setup({ b: { status: "archived", active: false }, extra: { [feedBlobName("cB", "p_b_" + S2)]: post("cB", "p_b_" + S2, S2, "كريم") } });
    expect((await myFeed(ctx)).jsonBody.posts).toEqual([]);
    expect((await react(ctx, "p_b_" + S2)).status).toBe(404);
  });
  it("the student report names a class the student is NOT in (another class of the same teacher): the home class answers, as before", async () => {
    const ctx = setup({ extra: { [CLS("cA2")]: cls("cA2", A), "platform/assignments/a1.json": assignment("a1", "cA"), "platform/assignments/x1.json": assignment("x1", "cA2") } });
    const r = await report(ctx, A, "type=student&classId=cA2&studentId=" + S);
    expect(r.status).toBe(200);
    expect(r.jsonBody.student.classId).toBe("cA");
    expect(r.jsonBody.academic.assessmentCount).toBe(1);
  });
  it("every student learning route asks the ONE serving rule (source pin: no route reads the home class on its own)", () => {
    for (const route of ["learning-content", "learning-study", "learning-run", "learning-trace", "learning-solve", "learning-exam-item", "learning-progress", "learning-annotations"]) {
      const source = readFileSync(path.join(__dirname, "../src/functions", route + ".js"), "utf8");
      expect(source, route).toContain("classroomServing(");
      expect(source, route).toContain("offersCourse(");
      expect(source, route).not.toMatch(/platform\/classes\/|CLASS_PREFIX/);
    }
  });
});

// The services a TEACHER offers their students (games; lib/access/student-services.js) while the owner ENFORCES access: for a shared
// class the teacher is that class's own teacher — never the home teacher. «learning-only» offers no game; «full-teaching» offers both.
describe("P11-C whose games: the teacher of the class, under enforce", () => {
  function enforce(presetA, presetB, options = {}) {
    const ctx = setup(options);
    for (const [id, preset] of [[A, presetA], [B, presetB]]) {
      const { revision } = buildRevision({ accountId: id, presetId: preset, presetVersion: 1, denies: [], createdBy: "owner:own_0011223344556677" });
      ctx.mem.setJson(revisionName(revision.revisionId), revision);
      ctx.mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username: "t." + id.slice(-2), displayName: "معلم", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId });
    }
    ctx.mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "enforce" });
    return ctx;
  }
  const rooms = () => {
    const b = room("cB", B, [{ studentId: S, displayName: "ليان" }], "K7MX4P"), a = room("cA", A, [{ studentId: S, displayName: "ليان" }], "R2R2R2");
    return { [sessionDocName(b.joinCode)]: b, [sessionDocName(a.joinCode)]: a };
  };
  const off = r => r.status === 403 && r.jsonBody && r.jsonBody.code === "SERVICE_NOT_AVAILABLE";

  it("the home teacher offers no game, the shared class's teacher does: the shared room and the number game open; the home room stays closed", async () => {
    const ctx = enforce("learning-only", "full-teaching", { extra: rooms() });
    expect((await play(ctx, "get", { joinCode: "K7MX4P" })).status).toBe(200);
    expect(off(await play(ctx, "get", { joinCode: "R2R2R2" }))).toBe(true);
    expect((await game(ctx)).status).toBe(200);
    expect((await bell(ctx)).jsonBody.services.games.sort()).toEqual(["live-challenge", "number-conversion"]);
  });
  it("the home teacher offers games, the shared class's teacher does not: the shared room is closed; the home room and the number game stay open", async () => {
    const ctx = enforce("full-teaching", "learning-only", { extra: rooms() });
    expect(off(await play(ctx, "get", { joinCode: "K7MX4P" }))).toBe(true);
    expect((await play(ctx, "get", { joinCode: "R2R2R2" })).status).toBe(200);
    expect((await game(ctx)).status).toBe(200);
  });
  it("no teacher of the student offers games: refused everywhere, and the bell offers none", async () => {
    const ctx = enforce("learning-only", "learning-only", { extra: rooms() });
    expect(off(await play(ctx, "get", { joinCode: "K7MX4P" }))).toBe(true);
    expect(off(await game(ctx))).toBe(true);
    expect((await bell(ctx)).jsonBody.services.games).toEqual([]);
  });
  it("an ARCHIVED shared class's teacher no longer opens the number game or the games entry", async () => {
    const ctx = enforce("learning-only", "full-teaching", { b: { status: "archived", active: false } });
    expect(off(await game(ctx))).toBe(true);
    expect((await bell(ctx)).jsonBody.services.games).toEqual([]);
  });
});
