// Phase 21G.2 — GET /api/assignment-progress: the progress of the teacher's published assignments. Drives the REAL handlers over
// the in-memory container. The figures equal the gradebook's own stats for the same assignment (parity), drafts / archived
// classes / other teachers' classes are never included, and the read is the Today hub's scoped shape.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const classrooms = require("../src/functions/manage-classrooms.js");
const students = require("../src/functions/manage-students.js");
const assignments = require("../src/functions/manage-assignments.js");
const results = require("../src/functions/assignment-results.js");
const overview = require("../src/functions/assignment-progress.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const multi = sub => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } });
const req = (method, body, url = "http://x/api") => ({ method, url, headers: { get: () => "" }, json: async () => body });
const EXAM = { examId: "", title: "امتحان", questions: [{ id: "q1", type: "trueFalse", text: "عبارة", marks: 1, answer: true }] };
const attempt = (n, percentage, extra = {}) => ({ attemptNumber: n, score: percentage / 10, totalMarks: 10, percentage, submittedAt: "2026-10-1" + n + "T08:00:00.000Z", finalized: true, manualReviewMarks: 0, ...extra });

async function setup() {
  const mem = createMemoryContainer();
  const deps = auth => ({ requireBuilderAuth: () => auth, container: mem.container, getContainer: () => mem.container, recordAuditEvent: async () => {}, ensurePublishedAssignmentIndexed: async () => {}, removePublishedAssignmentFromIndex: async () => {} });
  const A = multi("teacher-a"), B = multi("teacher-b");
  const mkClass = async (auth, name) => (await classrooms.handler(req("POST", { action: "create", name, grade: "11", schoolYear: "2026-2027" }), deps(auth))).jsonBody.classroom.classId;
  const mkStudent = async (auth, classId, firstName, identityNumber) => (await (students.handler || students.manageStudentsHandler)(req("POST", { action: "create", classId, firstName, familyName: "الطالب", identityNumber, password: "secret-123" }), deps(auth))).jsonBody.student.userId;
  const mkAssignment = async (auth, classId, title, publish) => (await assignments.handler(req("POST", { action: "create", classId, title, examSnapshot: EXAM, publish }), deps(auth))).jsonBody.assignment.assignmentId;
  const a1 = await mkClass(A, "صف أ"), b1 = await mkClass(B, "صف ب");
  const s1 = await mkStudent(A, a1, "سارة", "111111111"), s2 = await mkStudent(A, a1, "أحمد", "222222222"), s3 = await mkStudent(A, a1, "باسل", "333333333"), s4 = await mkStudent(A, a1, "تالا", "444444444");
  const pub = await mkAssignment(A, a1, "منشور", true), draft = await mkAssignment(A, a1, "مسودة", false), other = await mkAssignment(B, b1, "واجب ب", true);
  const sub = (aid, sid, doc) => mem.setJson("platform/submissions/" + aid + "/" + sid + ".json", { assignmentId: aid, studentId: sid, ...doc });
  sub(pub, s1, { attempts: [attempt(1, 50), attempt(2, 80)] });                                   // final 80
  sub(pub, s2, { attempts: [attempt(1, 40, { finalized: false, manualReviewMarks: 3 })] });       // pending review
  sub(pub, s3, { attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-10-16T08:00:00.000Z", endsAt: "2026-10-16T09:00:00.000Z" } }); // live, nothing submitted
  sub(pub, s4, { attempts: [attempt(1, 60)], activeAttempt: { attemptNumber: 2, startedAt: "2026-10-16T08:30:00.000Z", endsAt: "2026-10-16T09:30:00.000Z" } }); // graded AND a live second attempt
  const get = async auth => (await overview.handler(req("GET", null, "http://x/api/assignment-progress"), deps(auth))).jsonBody;
  return { mem, deps, A, B, a1, pub, draft, other, s4, get };
}

describe("21G.2 assignment progress", () => {
  it("reports the gradebook's own figures for each published assignment", async () => {
    const s = await setup();
    const body = await s.get(s.A);
    expect(body.ok).toBe(true);
    expect(body.progress).toEqual([{ assignmentId: s.pub, classId: s.a1, expected: 4, submitted: 3, notSubmitted: 1, pendingReview: 1, graded: 2, active: 2, average: 60, lastSubmittedAt: "2026-10-12T08:00:00.000Z" }]);
    // Parity with the gradebook (assignment-results GET stats) for the same assignment.
    const stats = (await results.handler(req("GET", null, "http://x/api/assignment-results?assignmentId=" + s.pub), s.deps(s.A))).jsonBody.stats;
    const p = body.progress[0];
    expect({ students: p.expected, submitted: p.submitted, pendingReview: p.pendingReview, finalized: p.graded, notSubmitted: p.notSubmitted, active: p.active, average: p.average })
      .toEqual({ students: stats.students, submitted: stats.submitted, pendingReview: stats.pendingReview, finalized: stats.finalized, notSubmitted: stats.notSubmitted, active: stats.active, average: stats.average });
  });

  it("never includes drafts, another teacher's classes, or archived classes", async () => {
    const s = await setup();
    expect((await s.get(s.A)).progress.map(p => p.assignmentId)).toEqual([s.pub]);
    expect((await s.get(s.B)).progress.map(p => p.assignmentId)).toEqual([s.other]);
    expect((await classrooms.handler(req("POST", { action: "archive", classId: s.a1 }), s.deps(s.A))).status).toBe(200);
    expect((await s.get(s.A)).progress).toEqual([]);
  });

  it("an assignment nobody has opened yet reports zeros and no average", async () => {
    const s = await setup();
    for (const name of s.mem.names("platform/submissions/" + s.pub + "/")) s.mem.store.delete(name);
    expect((await s.get(s.A)).progress[0]).toMatchObject({ expected: 4, submitted: 0, notSubmitted: 4, pendingReview: 0, graded: 0, active: 0, average: null, lastSubmittedAt: "" });
  });

  it("a storage failure is a calm 500, never a partial or invented figure", async () => {
    const s = await setup();
    const res = await overview.handler(req("GET"), { ...s.deps(s.A), listJson: async () => { throw new Error("down"); } });
    expect(res.status).toBe(500);
    expect(res.jsonBody).toEqual({ ok: false, error: "تعذر تحميل تقدم الواجبات حاليًا." });
  });
});
