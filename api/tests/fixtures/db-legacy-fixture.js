// Phase 15A — legacy platform data produced by the REAL handlers (class, students, assignment, attempts) over the
// in-memory blob container, so the 15A transform is tested against the exact documents production writes — not
// hand-written approximations. Shared by the transform tests and the SQL integration test.

const { createMemoryContainer } = require("./memory-container.js");
const { handler: classHandler } = require("../../src/functions/manage-classrooms.js");
const { handler: studentHandler } = require("../../src/functions/manage-students.js");
const { handler: assignmentHandler } = require("../../src/functions/manage-assignments.js");
const { handler: submissionHandler } = require("../../src/functions/student-submission.js");

const TEACHER_CODE = "teacher-1";
const BUILDER = { requireBuilderAuth: () => ({ ok: true, user: { sub: TEACHER_CODE } }) };
const builderDeps = ctx => ({ ...BUILDER, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const post = (url, body) => ({ method: "POST", url: "https://x/api/" + url, json: async () => body });

async function expectOk(promise, what) {
  const r = await promise;
  if (r.status !== 200) throw new Error(what + " failed: " + r.status + " " + JSON.stringify(r.jsonBody));
  return r.jsonBody;
}

/**
 * Builds: one active class with two students, one archived class, a published assignment with one submitted
 * attempt by the first student, plus a teacher profile. Returns { ctx, ids }.
 */
async function buildLegacyPlatform() {
  const ctx = createMemoryContainer();
  const deps = builderDeps(ctx);

  const live = await expectOk(classHandler(post("classrooms", { action: "create", name: "الثاني عشر 8", grade: "12", schoolYear: "2026-2027", programCode: "794589" }), deps), "create class");
  const classId = live.classroom?.classId || live.class?.classId || ctx.names("platform/classes/").map(n => ctx.getJson(n).classId)[0];
  const old = await expectOk(classHandler(post("classrooms", { action: "create", name: "الثاني عشر 3", grade: "12", schoolYear: "2025-2026" }), deps), "create old class");
  const oldClassId = old.classroom?.classId || old.class?.classId || ctx.names("platform/classes/").map(n => ctx.getJson(n).classId).find(id => id !== classId);

  await expectOk(studentHandler(post("students", { action: "create", classId, firstName: "سلمى", familyName: "خليل", identityNumber: "123456782", password: "secret-1" }), deps), "create student 1");
  await expectOk(studentHandler(post("students", { action: "create", classId, firstName: "يوسف", familyName: "ياسين", identityNumber: "234567891", password: "secret-2" }), deps), "create student 2");
  const users = ctx.names("platform/users/").map(n => ctx.getJson(n));
  const s1 = users.find(u => u.firstName === "سلمى");
  const s2 = users.find(u => u.firstName === "يوسف");

  const examSnapshot = { examId: "EX-1", title: "امتحان قصير", questions: [
    { id: "q1", type: "mcq", text: "ما هو البروتوكول؟", marks: 5, options: [{ id: "a", text: "TCP", correct: true }, { id: "b", text: "HTML" }] },
    { id: "q2", type: "open", text: "اشرح.", marks: 5 }
  ] };
  const created = await expectOk(assignmentHandler(post("assignments", { action: "create", classId, title: "واجب 1", examSnapshot, publish: true }), deps), "create assignment");
  const assignmentId = created.assignment.assignmentId;

  const student = ctx.getJson("platform/users/" + s1.userId + ".json");
  const session = { requireActiveStudentSession: async () => ({ ok: true, user: { sub: s1.userId, sv: 1 }, student, container: ctx.container }), container: ctx.container, getContainer: () => ctx.container };
  const sub = body => submissionHandler({ method: "POST", url: "https://x/api/student-submission/" + assignmentId, params: { assignmentId }, json: async () => body }, session);
  const started = await expectOk(sub({ action: "startAttempt" }), "start attempt");
  const active = started.submission?.activeAttempt || ctx.getJson("platform/submissions/" + assignmentId + "/" + s1.userId + ".json").activeAttempt;
  await expectOk(sub({ action: "submit", answers: { q1: "a", q2: "شرح" }, expectedAttemptNumber: active.attemptNumber, expectedStartedAt: active.startedAt, expectedAttemptEpoch: active.epoch || 1 }), "submit");

  ctx.setJson("platform/teacher-profiles/" + TEACHER_CODE + ".json", { displayName: "الأستاذ وفيق", avatarId: "a3", updatedAt: "2026-09-01T08:00:00.000Z" });

  return { ctx, ids: { classId, oldClassId, s1: s1.userId, s2: s2.userId, assignmentId }, names: { s1: s1.displayName, s2: s2.displayName }, identity: ["123456782", "234567891"] };
}

module.exports = { buildLegacyPlatform, TEACHER_CODE };
