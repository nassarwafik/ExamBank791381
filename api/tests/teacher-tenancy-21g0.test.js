// Phase 21G.0 — teacher tenancy: in multi-user mode every teacher works in their OWN space. Drives the REAL handlers over the shared
// in-memory blob container. Two teachers (A, B): B never sees, reads or changes A's classes or anything bound to them, and is answered
// exactly as if they did not exist. Pre-tenancy (unowned) data stays shared until the operator names LEGACY_DATA_OWNER; legacy
// single-password mode is unchanged. Written to import only the route handlers, so it runs unchanged against the pre-21G.0 baseline
// (fail-first evidence).
import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const classrooms = require("../src/functions/manage-classrooms.js");
const students = require("../src/functions/manage-students.js");
const assignments = require("../src/functions/manage-assignments.js");
const results = require("../src/functions/assignment-results.js");
const review = require("../src/functions/assignment-review.js");
const analysis = require("../src/functions/assignment-item-analysis.js");
const coding = require("../src/functions/coding-grading.js");
const codingRecovery = require("../src/functions/coding-grading-recovery.js");
const reports = require("../src/functions/reports.js");
const today = require("../src/functions/teacher-today.js");
const feed = require("../src/functions/teacher-achievement-feed.js");
const messages = require("../src/functions/messages.js");
const projects = require("../src/functions/project-tracker.js");
const analytics = require("../src/functions/teacher-analytics.js");
const photo = require("../src/functions/student-profile-photo.js");
const audit = require("../src/functions/audit-history.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const multi = sub => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } });
const legacy = () => ({ ok: true, user: { ver: 2, role: "teacher", sub: "builder", am: "legacy" } });
const req = (method, body, url = "http://x/api") => ({ method, url, headers: { get: () => "" }, json: async () => body });
const EXAM = { examId: "", title: "امتحان", questions: [{ id: "q1", type: "trueFalse", text: "عبارة", marks: 1, answer: true }] };
const CLASS = id => "platform/classes/" + id + ".json";
const legacyClass = (classId, name) => ({ schemaVersion: 1, classId, name, grade: "11", schoolYear: "2026-2027", active: true, studentIds: [], programCodes: [], createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" });

function platform(seed = {}) {
  const mem = createMemoryContainer(seed);
  const deps = auth => ({ requireBuilderAuth: () => auth, container: mem.container, getContainer: () => mem.container, recordAuditEvent: async () => {}, ensurePublishedAssignmentIndexed: async () => {}, removePublishedAssignmentFromIndex: async () => {} });
  return {
    mem,
    classes: async auth => (await classrooms.handler(req("GET"), deps(auth))).jsonBody.classes.map(c => c.classId).sort(),
    createClass: async (auth, name) => (await classrooms.handler(req("POST", { action: "create", name, grade: "11", schoolYear: "2026-2027" }), deps(auth))).jsonBody.classroom.classId,
    classAction: (auth, body) => classrooms.handler(req("POST", body), deps(auth)),
    students: async (auth, query = "") => (await studentsHandler(req("GET", null, "http://x/api/students" + query), deps(auth))).jsonBody.students.map(s => s.displayName).sort(),
    studentGet: (auth, query) => studentsHandler(req("GET", null, "http://x/api/students" + query), deps(auth)),
    studentPost: (auth, body) => studentsHandler(req("POST", body), deps(auth)),
    assignmentsOf: async auth => (await assignments.handler(req("GET", null, "http://x/api/assignments"), deps(auth))).jsonBody.assignments.map(a => a.title).sort(),
    assignmentPost: (auth, body) => assignments.handler(req("POST", body), deps(auth)),
    createAssignment: async (auth, classId, title) => (await assignments.handler(req("POST", { action: "create", classId, title, examSnapshot: EXAM, publish: false }), deps(auth))).jsonBody,
    resultsGet: (auth, id) => results.handler(req("GET", null, "http://x/api/assignment-results?assignmentId=" + id), deps(auth)),
    resultsPost: (auth, body) => results.handler(req("POST", body), deps(auth)),
    reviewGet: (auth, id, studentId) => review.handler(req("GET", null, "http://x/api/assignment-review?assignmentId=" + id + "&studentId=" + studentId), deps(auth)),
    analysisGet: (auth, id) => analysis.handler(req("GET", null, "http://x/api/assignment-item-analysis?assignmentId=" + id), deps(auth)),
    regrade: (auth, body) => (coding.regradeHandler)({ method: "POST", url: "http://x/api", headers: { get: () => "" }, text: async () => JSON.stringify(body), json: async () => body }, deps(auth)),
    bulkRetry: (auth, body) => (codingRecovery.bulkRetryHandler)({ method: "POST", url: "http://x/api", headers: { get: () => "" }, text: async () => JSON.stringify(body), json: async () => body }, deps(auth)),
    addStudent: async (auth, classId, firstName, identityNumber) => (await studentsHandler(req("POST", { action: "create", classId, firstName, familyName: "الطالب", identityNumber, password: "secret-123" }), deps(auth))).jsonBody.student.userId
  };
}
const studentsHandler = (request, d) => (students.handler || students.manageStudentsHandler)(request, d);
afterEach(() => { delete process.env.LEGACY_DATA_OWNER; });

describe("21G.0 classes belong to the teacher who created them", () => {
  it("a teacher lists only their own classes; another teacher's are invisible", async () => {
    const p = platform();
    const a = await p.createClass(multi("teacher-a"), "صف أ");
    const b = await p.createClass(multi("teacher-b"), "صف ب");
    expect(await p.classes(multi("teacher-a"))).toEqual([a]);
    expect(await p.classes(multi("teacher-b"))).toEqual([b]);
  });
  it("another teacher's class cannot be changed, and is reported exactly like a missing one", async () => {
    const p = platform();
    const a = await p.createClass(multi("teacher-a"), "صف أ");
    const before = JSON.stringify(p.mem.getJson(CLASS(a)));
    for (const body of [{ action: "archive", classId: a }, { action: "setPrograms", classId: a, programCodes: [] }, { action: "reconcileRoster", classId: a }]) {
      const res = await p.classAction(multi("teacher-b"), body);
      const missing = await p.classAction(multi("teacher-b"), { ...body, classId: "no-such-class" });
      expect(res.status).toBe(404);
      expect(res.jsonBody).toEqual(missing.jsonBody);
    }
    expect(JSON.stringify(p.mem.getJson(CLASS(a)))).toBe(before);
    expect((await p.classAction(multi("teacher-a"), { action: "archive", classId: a })).status).toBe(200);
  });
  it("legacy single-password mode is unchanged: one shared space", async () => {
    const p = platform();
    const a = await p.createClass(legacy(), "صف أ");
    const b = await p.createClass(legacy(), "صف ب");
    expect(await p.classes(legacy())).toEqual([a, b].sort());
  });
});

describe("21G.0 pre-tenancy data", () => {
  it("stays shared until LEGACY_DATA_OWNER names its owner; then only that teacher sees it", async () => {
    const p = platform({ [CLASS("old-1")]: legacyClass("old-1", "صف قديم") });
    expect(await p.classes(multi("teacher-a"))).toEqual(["old-1"]);
    expect(await p.classes(multi("teacher-b"))).toEqual(["old-1"]);
    process.env.LEGACY_DATA_OWNER = "teacher-a";
    expect(await p.classes(multi("teacher-a"))).toEqual(["old-1"]);
    expect(await p.classes(multi("teacher-b"))).toEqual([]);
    expect((await p.classAction(multi("teacher-b"), { action: "archive", classId: "old-1" })).status).toBe(404);
  });
});

describe("21G.0 students belong to their class's teacher", () => {
  async function twoTeachers() {
    const p = platform();
    const a = await p.createClass(multi("teacher-a"), "صف أ");
    const b = await p.createClass(multi("teacher-b"), "صف ب");
    const sa = await p.addStudent(multi("teacher-a"), a, "سارة", "111111111");
    const sb = await p.addStudent(multi("teacher-b"), b, "باسل", "222222222");
    return { p, a, b, sa, sb };
  }
  it("each teacher lists only their own students (all classes, or one class)", async () => {
    const { p, a } = await twoTeachers();
    expect(await p.students(multi("teacher-a"))).toEqual(["سارة الطالب"]);
    expect(await p.students(multi("teacher-b"))).toEqual(["باسل الطالب"]);
    expect(await p.students(multi("teacher-b"), "?classId=" + a)).toEqual([]);
  });
  it("another teacher's student cannot be viewed, changed, reset, archived or moved", async () => {
    const { p, b, sa } = await twoTeachers();
    const before = JSON.stringify(p.mem.getJson("platform/users/" + sa + ".json"));
    const B = multi("teacher-b");
    expect((await p.studentGet(B, "?profileUserId=" + sa)).status).toBe(404);
    expect((await p.studentPost(B, { action: "update", userId: sa, firstName: "مخترق" })).status).toBe(404);
    expect((await p.studentPost(B, { action: "resetPassword", userId: sa })).status).toBe(404);
    expect((await p.studentPost(B, { action: "archive", userId: sa })).status).toBe(404);
    const bulk = await p.studentPost(B, { action: "bulkAction", operation: "move", userIds: [sa], targetClassId: b });
    expect(bulk.jsonBody.ok === true ? bulk.jsonBody.errors?.length : 1).toBeGreaterThan(0);
    expect(JSON.stringify(p.mem.getJson("platform/users/" + sa + ".json"))).toBe(before);
  });
  it("a teacher cannot add students to, or move students into, another teacher's class", async () => {
    const { p, a, sb } = await twoTeachers();
    const B = multi("teacher-b");
    expect((await p.studentPost(B, { action: "create", classId: a, firstName: "دخيل", familyName: "الطالب", identityNumber: "333333333", password: "secret-123" })).status).toBe(400);
    expect((await p.studentPost(B, { action: "update", userId: sb, classId: a })).status).toBe(400);
    expect(p.mem.getJson("platform/users/" + sb + ".json").classId).not.toBe(a);
  });
  it("a taken identity number never reveals another teacher's student or class", async () => {
    const { p, b } = await twoTeachers();
    const res = await p.studentPost(multi("teacher-b"), { action: "create", classId: b, firstName: "مكرر", familyName: "الطالب", identityNumber: "111111111", password: "secret-123" });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.jsonBody)).not.toMatch(/سارة|صف أ/);
    const preview = await p.studentPost(multi("teacher-b"), { action: "previewImport", students: [{ firstName: "مكرر", familyName: "الطالب", identityNumber: "111111111" }] });
    expect(JSON.stringify(preview.jsonBody)).not.toMatch(/سارة|صف أ/);
  });
});

describe("21G.0 assignments, results and grading belong to the class's teacher", () => {
  async function setup() {
    const p = platform();
    const a = await p.createClass(multi("teacher-a"), "صف أ");
    const b = await p.createClass(multi("teacher-b"), "صف ب");
    const sa = await p.addStudent(multi("teacher-a"), a, "سارة", "111111111");
    const created = await p.createAssignment(multi("teacher-a"), a, "واجب أ");
    expect(created.ok).toBe(true);
    const id = created.assignment?.assignmentId || created.assignmentId;
    await p.createAssignment(multi("teacher-b"), b, "واجب ب");
    return { p, a, b, sa, id };
  }
  it("each teacher lists only the assignments of their own classes", async () => {
    const { p } = await setup();
    expect(await p.assignmentsOf(multi("teacher-a"))).toEqual(["واجب أ"]);
    expect(await p.assignmentsOf(multi("teacher-b"))).toEqual(["واجب ب"]);
  });
  it("another teacher can neither create an assignment in the class nor publish, retime, archive or purge one", async () => {
    const { p, a, id } = await setup();
    const B = multi("teacher-b");
    expect((await p.createAssignment(B, a, "دخيل")).ok).toBe(false);
    const before = JSON.stringify(p.mem.getJson("platform/assignments/" + id + ".json"));
    for (const body of [{ action: "setStatus", assignmentId: id, status: "published" }, { action: "setMaxAttempts", assignmentId: id, maxAttempts: 3 }, { action: "updateTiming", assignmentId: id, dueAt: "2030-01-01T00:00:00Z" }, { action: "archive", assignmentId: id }, { action: "deleteImpact", assignmentId: id }]) {
      const res = await p.assignmentPost(B, body);
      expect(res.status).toBe(404);
    }
    expect(JSON.stringify(p.mem.getJson("platform/assignments/" + id + ".json"))).toBe(before);
  });
  it("another teacher cannot read the gradebook, a student's paper, the item analysis, or change attempts", async () => {
    const { p, sa, id } = await setup();
    const B = multi("teacher-b");
    expect((await p.resultsGet(B, id)).status).toBe(404);
    expect((await p.resultsPost(B, { action: "allowRetry", assignmentId: id, studentId: sa })).status).toBe(404);
    // A real paper exists (teacher A opens it); teacher B is answered exactly as for a paper that does not exist.
    p.mem.setJson("platform/submissions/" + id + "/" + sa + ".json", { assignmentId: id, studentId: sa, attempts: [{ attemptNumber: 1, submittedAt: "2026-09-02T00:00:00.000Z", score: 1, totalMarks: 1, percentage: 100, manualReviewMarks: 0, finalized: true, questionGrades: [{ questionId: "q1", score: 1 }], answers: { q1: { kind: "trueFalse", value: true } } }] });
    expect((await p.reviewGet(multi("teacher-a"), id, sa)).status).toBe(200);
    const paper = await p.reviewGet(B, id, sa);
    expect(paper.status).toBe(404);
    expect(paper.jsonBody).toEqual((await p.reviewGet(B, id, "no-such-student")).jsonBody);
    expect((await p.analysisGet(B, id)).status).toBe(404);
    expect((await p.regrade(B, { action: "retry", assignmentId: id, studentId: sa, attemptNumber: 1, questionId: "q1" })).status).toBe(404);
    expect((await p.bulkRetry(B, { assignmentId: id })).status).toBe(404);
    expect((await p.resultsGet(multi("teacher-a"), id)).status).toBe(200);
  });
});

describe("21G.0 everything derived from classes covers only the teacher's own", () => {
  async function setup() {
    const p = platform();
    const a = await p.createClass(multi("teacher-a"), "صف أ");
    const b = await p.createClass(multi("teacher-b"), "صف ب");
    const sa = await p.addStudent(multi("teacher-a"), a, "سارة", "111111111");
    const created = await p.createAssignment(multi("teacher-a"), a, "واجب أ");
    const id = created.assignment?.assignmentId || created.assignmentId;
    await p.assignmentPost(multi("teacher-a"), { action: "setStatus", assignmentId: id, status: "published" });
    return { p, a, b, sa, id };
  }
  const get = (p, h, auth, url) => h.handler(req("GET", null, "http://x/api" + url), { requireBuilderAuth: () => auth, container: p.mem.container, getContainer: () => p.mem.container, recordAuditEvent: async () => {} });
  const post = (p, h, auth, body) => h.handler(req("POST", body), { requireBuilderAuth: () => auth, container: p.mem.container, getContainer: () => p.mem.container, recordAuditEvent: async () => {} });
  it("reports: another teacher's class or student report answers like a missing one; the filters list only own classes", async () => {
    const { p, a, b, sa } = await setup();
    const B = multi("teacher-b");
    expect((await get(p, reports, B, "/reports?type=class&classId=" + a)).status).toBe(404);
    expect((await get(p, reports, B, "/reports?type=student&studentId=" + sa)).status).toBe(404);
    expect((await get(p, reports, B, "/reports?type=classStudents&classId=" + a)).status).toBe(404);
    expect((await get(p, reports, B, "/reports?type=filters")).jsonBody.classes.map(c => c.classId)).toEqual([b]);
    expect((await get(p, reports, multi("teacher-a"), "/reports?type=class&classId=" + a)).status).toBe(200);
  });
  it("the Today hub counts only the teacher's own classes, students and assignments", async () => {
    const { p } = await setup();
    const B = (await get(p, today, multi("teacher-b"), "/teacher-today")).jsonBody;
    const A = (await get(p, today, multi("teacher-a"), "/teacher-today")).jsonBody;
    expect(B.scope).toMatchObject({ activeClasses: 1, students: 0, publishedAssignments: 0 });
    expect(A.scope).toMatchObject({ activeClasses: 1, students: 1, publishedAssignments: 1 });
  });
  it("the achievement feed and analytics refuse another teacher's class", async () => {
    const { p, a } = await setup();
    const B = multi("teacher-b");
    expect((await get(p, feed, B, "/teacher-achievement-feed?classId=" + a)).status).toBe(404);
    expect((await post(p, feed, B, { action: "react", classId: a, postId: "x", reaction: "👏" })).status).toBe(404);
    expect((await get(p, analytics, B, "/teacher-analytics?classId=" + a)).status).toBe(404);
    expect((await get(p, analytics, multi("teacher-a"), "/teacher-analytics?classId=" + a)).status).toBe(200);
  });
  it("messages: another teacher's student thread and class announcements answer like missing ones; nothing can be sent", async () => {
    const { p, a, sa } = await setup();
    const B = multi("teacher-b");
    expect((await get(p, messages, B, "/messages?studentId=" + sa)).status).toBe(404);
    expect((await get(p, messages, B, "/messages?classId=" + a + "&kind=announcements")).status).toBe(404);
    expect((await post(p, messages, B, { action: "sendDirect", studentId: sa, body: "مرحبا" })).status).toBe(404);
    expect((await post(p, messages, B, { action: "sendAnnouncement", classId: a, body: "مرحبا" })).status).toBe(404);
    expect(p.mem.names("platform/messages/").length).toBe(0);
  });
  it("projects: another teacher's enrolled class is not listed and answers exactly like a missing one", async () => {
    const { p, a } = await setup();
    expect((await p.classAction(multi("teacher-a"), { action: "setPrograms", classId: a, programCodes: ["794589"] })).status).toBe(200);
    const own = await get(p, projects, multi("teacher-a"), "/project-tracker?projectCode=794589&resource=summary&classId=" + a);
    expect(own.status).toBe(200);
    expect((await get(p, projects, multi("teacher-a"), "/project-tracker?projectCode=794589&resource=classes")).jsonBody.classes.map(c => c.classId)).toEqual([a]);
    expect((await get(p, projects, multi("teacher-b"), "/project-tracker?projectCode=794589&resource=classes")).jsonBody.classes).toEqual([]);
    const res = await get(p, projects, multi("teacher-b"), "/project-tracker?projectCode=794589&resource=summary&classId=" + a);
    const missing = await get(p, projects, multi("teacher-b"), "/project-tracker?projectCode=794589&resource=summary&classId=no-such-class");
    expect(res.status).toBe(404);
    expect(res.jsonBody).toEqual(missing.jsonBody);
  });
  // Phase P-9 — the legacy /api/project-794589 route is removed; its tenancy guarantees are kept here on the generic
  // route that serves 794589 (every resource it had, and project.reset).
  it("794589 on the generic route: another teacher's class is not listed, not readable and not writable", async () => {
    const { p, a } = await setup();
    expect((await p.classAction(multi("teacher-a"), { action: "setPrograms", classId: a, programCodes: ["794589"] })).status).toBe(200);
    expect((await get(p, projects, multi("teacher-a"), "/project-tracker?projectCode=794589&resource=classes")).jsonBody.classes.map(c => c.classId)).toEqual([a]);
    expect((await get(p, projects, multi("teacher-b"), "/project-tracker?projectCode=794589&resource=classes")).jsonBody.classes).toEqual([]);
    for (const resource of ["summary", "students", "template"]) {
      const res = await get(p, projects, multi("teacher-b"), "/project-tracker?projectCode=794589&resource=" + resource + "&classId=" + a);
      const missing = await get(p, projects, multi("teacher-b"), "/project-tracker?projectCode=794589&resource=" + resource + "&classId=no-such-class");
      expect(res.status).toBe(404);
      expect(res.jsonBody).toEqual(missing.jsonBody);
    }
    const reset = await post(p, projects, multi("teacher-b"), { projectCode: "794589", action: "project.reset", classId: a });
    expect(reset.status).toBe(404);
    expect((await get(p, projects, multi("teacher-a"), "/project-tracker?projectCode=794589&resource=summary&classId=" + a)).status).toBe(200);
  });
  it("student photos: another teacher's student is invisible and cannot be changed", async () => {
    const { p, sa } = await setup();
    const B = multi("teacher-b");
    const shown = await get(p, photo, B, "/student-profile-photo?studentId=" + sa);
    expect(JSON.stringify(shown.jsonBody || {})).not.toMatch(/url|dataUrl/);
    expect((await post(p, photo, B, { action: "remove", studentId: sa })).status).toBe(404);
  });
  it("the activity log shows a teacher only their own actions", async () => {
    const p = platform({
      "platform/audit/2026-10-16T10:00:00.000Z-a.json": { actor: "teacher-a", action: "class.create", targetType: "class", targetId: "c1", targetLabel: "صف أ", at: "2026-10-16T10:00:00.000Z" },
      "platform/audit/2026-10-16T11:00:00.000Z-b.json": { actor: "teacher-b", action: "class.create", targetType: "class", targetId: "c2", targetLabel: "صف ب", at: "2026-10-16T11:00:00.000Z" }
    });
    const events = (await get(p, audit, multi("teacher-b"), "/audit-history")).jsonBody.events;
    expect(events.map(e => e.targetLabel)).toEqual(["صف ب"]);
    expect((await get(p, audit, legacy(), "/audit-history")).jsonBody.events).toHaveLength(2);
  });
});
