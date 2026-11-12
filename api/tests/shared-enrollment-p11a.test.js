import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P11-A — ONE student account in MORE THAN ONE class (owner decision: «الطالب يستطيع ان يتعلم عند اكثر من معلم»). TEST data only.
//   the student keeps one account and one home class (teacher A); the owner ADDS the student to a class of teacher B (a shared class);
//   the student sees and solves the assignments of both classes; each teacher sees the results of THEIR class only; the account itself
//   stays with the owner and the home teacher (B may only remove the student from B's class); B never reaches A's conversation;
//   leaving a shared class, archiving or deleting is refused while work there awaits its teacher.
// The first block (a shared student, state seeded directly) is the FAIL-FIRST evidence: it runs on main, where every test of it fails.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p11a-shared-enrollment-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: ownerClasses } = await import("../src/functions/owner-classes.js");
const { handler: students } = await import("../src/functions/manage-students.js");
const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { handler: messages } = await import("../src/functions/messages.js");
const { handler: results } = await import("../src/functions/assignment-results.js");
const { handler: review } = await import("../src/functions/assignment-review.js");
const { handler: itemAnalysis } = await import("../src/functions/assignment-item-analysis.js");
const { handler: progress } = await import("../src/functions/assignment-progress.js");
const { handler: today } = await import("../src/functions/teacher-today.js");
const { handler: dashboard } = await import("../src/functions/student-dashboard.js");
const { handler: studentAssignment } = await import("../src/functions/student-assignment.js");
const { handler: submission } = await import("../src/functions/student-submission.js");
const codingRun = cjs("../src/functions/coding-run.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { directPrefix, sequencedMessageId } = await import("../src/lib/message-store.js");
const { createUnreadMemo } = await import("../src/lib/message-unread-memo.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");
const { studentCodeHash, hashPassword } = cjs("../src/lib/student-auth.js");

const OWNER_ID = "own_0011223344556677";
const A = "t_00112233445566aa", B = "t_00112233445566bb", C = "t_00112233445566cc";
const S = "11111111-1111-1111-1111-111111111111";      // home: cA (teacher A)
const S2 = "22222222-2222-2222-2222-222222222222";     // teacher B's own student (cB)
const USER = id => "platform/users/" + id + ".json";
const SUB = (assignmentId, id = S) => "platform/submissions/" + assignmentId + "/" + id + ".json";
const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const future = () => new Date(Date.now() + 7 * 86400000).toISOString();
const cls = (classId, ownerId, over = {}) => ({ schemaVersion: 1, classId, name: "صف " + classId, grade: "12", schoolYear: "2026-2027", active: true, status: "active", studentIds: [], ownerId, createdAt: "2026-09-01T00:00:00.000Z", ...over });
const assignment = (assignmentId, classId, over = {}) => ({
  schemaVersion: 2, attemptModelVersion: 2, assignmentId, classId, title: "واجب " + assignmentId, instructions: "", status: "published", openAt: "", dueAt: future(),
  maxAttempts: 2, durationMinutes: 0, questionCount: 1, totalMarks: 10, sourceExamTitle: "امتحان",
  examSnapshot: { title: "امتحان", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "اشرح", marks: 10, answer: { text: "SECRET" } }] },
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...over
});
const finalAttempt = (percentage = 80) => ({ attemptNumber: 1, score: percentage / 10, totalMarks: 10, percentage, finalized: true, submittedAt: "2026-10-02T00:00:00.000Z" });
const openAttempt = () => ({ attempts: [], activeAttempt: { attemptNumber: 1, startedAt: new Date(Date.now() - 60000).toISOString() } });
const awaitingReview = () => ({ attempts: [{ attemptNumber: 1, score: 3, totalMarks: 10, percentage: 30, finalized: false, submittedAt: "2026-10-02T00:00:00.000Z" }] });

function setup({ shared = false, seedResults = false } = {}) {
  resetOperatorGateCache();
  const student = (userId, classId, ownerId, displayName, identityNumber, over = {}) => ({
    schemaVersion: 3, role: "student", userId, classId, ownerId, displayName, firstName: displayName.split(" ")[0], familyName: displayName.split(" ")[1],
    code: identityNumber, identityNumber, active: true, archived: false, authVersion: 1, profileRevision: 0, createdAt: "2026-09-02T00:00:00.000Z", ...over
  });
  const mem = createMemoryContainer({
    "platform/classes/cA.json": cls("cA", A, { studentIds: [S] }), "platform/classes/cA2.json": cls("cA2", A),
    "platform/classes/cB.json": cls("cB", B, { studentIds: shared ? [S, S2] : [S2] }), "platform/classes/cB2.json": cls("cB2", B),
    "platform/classes/cBold.json": cls("cBold", B, { active: false, status: "archived" }), "platform/classes/cC.json": cls("cC", C),
    [USER(S)]: student(S, "cA", A, "ليان سعيد", "300000001", shared ? { sharedClasses: [{ classId: "cB", addedAt: "2026-10-01T00:00:00.000Z", addedBy: "owner:" + OWNER_ID }] } : {}),
    [USER(S2)]: student(S2, "cB", B, "كريم ناصر", "300000002"),
    "platform/assignments/a1.json": assignment("a1", "cA"),
    "platform/assignments/b1.json": assignment("b1", "cB"),
    ...(seedResults ? {
      [SUB("a1")]: { assignmentId: "a1", studentId: S, classId: "cA", attempts: [finalAttempt(80)] },
      [SUB("b1")]: { assignmentId: "b1", studentId: S, classId: "cB", attempts: [finalAttempt(60)] }
    } : {})
  });
  // the login documents (the identity number is the platform-wide login: this is what makes an identity "taken")
  for (const [userId, code] of [[S, "300000001"], [S2, "300000002"]]) mem.setJson("platform/auth/" + studentCodeHash(code) + ".json", { schemaVersion: 3, userId, codeHash: studentCodeHash(code), ...hashPassword("initial-pass-1"), active: true, authVersion: 1, createdAt: "2026-09-02T00:00:00.000Z" });
  // one message of the student to the home teacher, before anything else
  const prefix = directPrefix(S), messageId = sequencedMessageId(prefix, 1);
  mem.setJson(prefix + messageId + ".json", { schemaVersion: 1, messageId, createdAt: "2026-10-03T08:00:00.000Z", kind: "direct", studentId: S, senderRole: "student", senderId: S, senderDisplayName: "ليان", body: "سؤال خاص لمعلمتي", classIdAtSend: "cA" });
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
  const as = sub => ({ ...base, requireBuilderAuth: () => ({ ok: true, user: { sub, am: "multi-user" } }), unreadMemo: createUnreadMemo(), resolveTeacherDisplayName: async () => "أ.", notifyStudentOfNewMessage: async () => {} });
  const asStudent = (id = S) => ({ container: mem.container, getContainer: () => mem.container, requireStudentAuth: () => ({ ok: true, user: { sub: id, sv: 1, role: "student" } }), recordGlobalRankMilestone: async () => {}, aggregateRecognition: async () => new Map(), recordAchievementIfEligible: async () => {} });
  return { mem, messageId, ...heads, ownerDeps: base, as, asStudent };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const owner = (ctx, action, body, headers = ctx.owner) => ownerClasses({ method: "POST", url: "https://x/api/owner-classes/" + action, params: { action }, headers: hdr(headers), json: async () => body }, ctx.ownerDeps);
const ownerGet = (ctx, action, query) => ownerClasses({ method: "GET", url: "https://x/api/owner-classes/" + action, params: { action }, query: new URLSearchParams(query), headers: hdr(ctx.owner) }, ctx.ownerDeps);
const teacherGet = (handler, ctx, sub, path) => handler({ method: "GET", url: "https://x/api/" + path, headers: hdr({}) }, ctx.as(sub), quiet);
const teacherPost = (handler, ctx, sub, body) => handler({ method: "POST", url: "https://x/api/x", headers: hdr({}), json: async () => body }, ctx.as(sub), quiet);
const roster = async (ctx, sub, classId) => (await teacherGet(students, ctx, sub, "students?classId=" + classId + "&includeArchived=1")).jsonBody.students;
const gradebook = async (ctx, sub, assignmentId) => (await teacherGet(results, ctx, sub, "assignment-results?assignmentId=" + assignmentId)).jsonBody;
const profile = async (ctx, sub, userId = S) => (await teacherGet(students, ctx, sub, "students?profileUserId=" + userId)).jsonBody;
const studentGet = (handler, ctx, assignmentId, id = S) => handler({ method: "GET", url: "https://x/api/s", params: { assignmentId }, headers: hdr({}) }, ctx.asStudent(id), quiet);
const studentPost = (ctx, assignmentId, body, id = S) => submission({ method: "POST", url: "https://x/api/s", params: { assignmentId }, headers: hdr({}), json: async () => body }, ctx.asStudent(id), quiet);
const runCode = (ctx, assignmentId, id = S) => codingRun.runHandler({ method: "POST", url: "https://x/api/coding-run", headers: hdr({}), json: async () => ({ assignmentId, language: "python", languageVersion: 3, questionId: "q1", source: "print(1)", stdin: "" }) }, ctx.asStudent(id), quiet);
const dash = async (ctx, id = S) => (await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: hdr({}) }, ctx.asStudent(id), quiet));
const userDoc = (ctx, id = S) => ctx.mem.getJson(USER(id));
const snapshot = ctx => JSON.stringify([...ctx.mem.store.entries()].map(([name, e]) => [name, e.content.toString("utf8")]).sort());

describe("P11-A fail-first — a student of teacher A who is ALSO in a class of teacher B (state seeded directly)", () => {
  it("the student's dashboard lists the assignments of BOTH classes, each with its class", async () => {
    const ctx = setup({ shared: true });
    const r = await dash(ctx);
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const byId = Object.fromEntries(r.jsonBody.assignments.map(a => [a.assignmentId, a]));
    expect(Object.keys(byId).sort()).toEqual(["a1", "b1"]);
    expect([byId.a1.classId, byId.b1.classId]).toEqual(["cA", "cB"]);
    expect(byId.b1.className).toBe("صف cB");
    expect(r.jsonBody.classroom.classId).toBe("cA");                                            // the home class is still the home class
    expect(r.jsonBody.classes).toEqual([expect.objectContaining({ classId: "cA", shared: false }), expect.objectContaining({ classId: "cB", shared: true })]);
  });
  it("the student opens and starts the assignment of the shared class; the submission belongs to THAT class", async () => {
    const ctx = setup({ shared: true });
    expect((await studentGet(studentAssignment, ctx, "b1")).status).toBe(200);
    expect((await studentGet(submission, ctx, "b1")).status).toBe(200);
    const started = await studentPost(ctx, "b1", { action: "startAttempt" });
    expect(started.status, JSON.stringify(started.jsonBody)).toBe(200);
    expect(ctx.mem.getJson(SUB("b1"))).toMatchObject({ assignmentId: "b1", studentId: S, classId: "cB" });
    expect((await runCode(ctx, "b1")).jsonBody.code).not.toBe("ASSIGNMENT_UNAVAILABLE");        // past the class check (refused later: not a coding question)
  });
  it("teacher B's roster of the class lists the shared student, marked shared", async () => {
    const ctx = setup({ shared: true });
    const rows = await roster(ctx, B, "cB");
    expect(rows.map(s => s.userId).sort()).toEqual([S, S2].sort());
    expect(rows.find(s => s.userId === S)).toMatchObject({ shared: true, classId: "cB", displayName: "ليان سعيد" });
    expect(rows.find(s => s.userId === S2).shared).toBeFalsy();
  });
  it("B's row of the shared student counts the work handed in to B's class only, and offers no photo", async () => {
    const ctx = setup({ shared: true, seedResults: true });
    ctx.mem.setJson(USER(S), { ...userDoc(ctx), profilePhoto: { version: 3, updatedAt: "2026-10-01T00:00:00.000Z" } });
    const b = (await roster(ctx, B, "cB")).find(s => s.userId === S), a = (await roster(ctx, A, "cA")).find(s => s.userId === S);
    expect([b.submittedAssignmentsCount, b.profilePhoto]).toEqual([1, null]);                    // b1 only — not teacher A's a1
    expect(a.submittedAssignmentsCount).toBe(2);                                                 // the home row: the whole history, as before
    expect(a.profilePhoto).toMatchObject({ version: 3 });
  });
  it("teacher B's gradebook, review, item analysis, progress and day count the shared student", async () => {
    const ctx = setup({ shared: true, seedResults: true });
    const g = await gradebook(ctx, B, "b1");
    expect(g.students.map(s => s.studentId).sort()).toEqual([S, S2].sort());
    expect(g.stats).toMatchObject({ students: 2, submitted: 1, finalized: 1 });
    expect(g.students.find(s => s.studentId === S).latestResult).toMatchObject({ percentage: 60 });
    const one = await teacherGet(results, ctx, B, "assignment-results?assignmentId=b1&studentId=" + S);
    expect(one.status).toBe(200);
    const rv = await teacherGet(review, ctx, B, "assignment-review?assignmentId=b1&studentId=" + S + "&attemptNumber=1");
    expect(rv.status, JSON.stringify(rv.jsonBody)).toBe(200);
    const retry = await teacherPost(results, ctx, B, { action: "allowRetry", assignmentId: "b1", studentId: S });
    expect(retry.status, JSON.stringify(retry.jsonBody)).toBe(200);                             // a write on the student's row in B's class
    const ia = await teacherGet(itemAnalysis, ctx, B, "assignment-item-analysis?assignmentId=b1");
    expect(ia.status).toBe(200);
    expect(ia.jsonBody).toMatchObject({ studentsInClass: 2, studentsSubmitted: 1 });
    const pr = (await teacherGet(progress, ctx, B, "assignment-progress")).jsonBody.progress.find(p => p.assignmentId === "b1");
    expect(pr).toMatchObject({ expected: 2, submitted: 1 });
    expect((await teacherGet(today, ctx, B, "teacher-today")).status).toBe(200);
  });
  it("teacher B opens the student's profile and sees the results of B's class only", async () => {
    const ctx = setup({ shared: true, seedResults: true });
    const p = await profile(ctx, B);
    expect(p.ok, JSON.stringify(p)).toBe(true);
    expect(p.profile.submittedAssignments.map(x => x.assignmentId)).toEqual(["b1"]);
    expect(p.profile.assignments.map(x => x.assignmentId)).toEqual(["b1"]);
    expect(p.profile.classroom.classId).toBe("cB");
    expect(p.profile.student.shared).toBe(true);
  });
});

describe("P11-A isolation — what a shared class does NOT give", () => {
  it("teacher A is untouched: the student is A's, A's gradebook and profile show A's class only", async () => {
    const ctx = setup({ shared: true, seedResults: true });
    expect((await roster(ctx, A, "cA")).map(s => [s.userId, !!s.shared])).toEqual([[S, false]]);
    expect((await gradebook(ctx, A, "a1")).students.map(s => s.studentId)).toEqual([S]);
    const p = await profile(ctx, A);
    expect(p.profile.submittedAssignments.map(x => x.assignmentId)).toEqual(["a1"]);
    expect(p.profile.classroom.classId).toBe("cA");
    expect((await teacherGet(results, ctx, A, "assignment-results?assignmentId=b1")).status).toBe(404);   // B's assignment is not A's
  });
  it("teacher B cannot change the ACCOUNT: edit, password, login state, archive, delete, move — 404 and nothing written", async () => {
    const ctx = setup({ shared: true });
    const before = snapshot(ctx);
    for (const body of [
      { action: "update", userId: S, firstName: "اسم", familyName: "آخر" }, { action: "resetPassword", userId: S }, { action: "toggleActive", userId: S, active: false },
      { action: "archive", userId: S }, { action: "delete", userId: S }
    ]) {
      const r = await teacherPost(students, ctx, B, body);
      expect([body.action, r.status]).toEqual([body.action, 404]);
    }
    for (const operation of ["deactivate", "archive", "resetpasswords", "delete", "move"]) {
      const r = await teacherPost(students, ctx, B, { action: "bulkAction", operation, userIds: [S], targetClassId: "cB2" });
      expect([operation, r.jsonBody.processed, r.jsonBody.failed, (r.jsonBody.credentials || []).length]).toEqual([operation, 0, 1, 0]);
    }
    expect(snapshot(ctx)).toBe(before);
  });
  it("teacher B never reaches the student's conversation with teacher A", async () => {
    const ctx = setup({ shared: true });
    // Tadris+ P11-B — teacher B now HAS a conversation with the shared student, a SEPARATE one (api/tests/shared-messaging-p11b.test.js).
    // What this test pins is unchanged: B never sees teacher A's conversation, and nothing B does lands in it. (Before P11-B, B's
    // request for this student was refused altogether: `ok` not true, the send ≥ 400.)
    const thread = await teacherGet(messages, ctx, B, "messages?studentId=" + S);
    expect(JSON.stringify(thread.jsonBody)).not.toContain("سؤال خاص");
    expect(thread.jsonBody.messages || []).toEqual([]);
    await teacherPost(messages, ctx, B, { action: "sendDirect", studentId: S, body: "مرحبا" });
    expect(ctx.mem.names(directPrefix(S))).toHaveLength(1);                                      // A's conversation got nothing from B
    expect((await teacherGet(messages, ctx, A, "messages?studentId=" + S)).jsonBody.messages.map(m => m.messageId)).toEqual([ctx.messageId]);
  });
  it("a teacher who shares nothing with the student sees nothing: roster, profile, gradebook", async () => {
    const ctx = setup({ shared: true, seedResults: true });
    expect(await roster(ctx, C, "cB")).toEqual([]);
    expect((await profile(ctx, C)).ok).not.toBe(true);
    expect((await teacherGet(results, ctx, C, "assignment-results?assignmentId=b1")).status).toBe(404);
    expect((await roster(ctx, B, "cB2"))).toEqual([]);                                           // B's OTHER class does not list the student
  });
  it("a student who is NOT in the class cannot open, start or run its assignment", async () => {
    const ctx = setup();                                                                          // not shared
    expect((await dash(ctx)).jsonBody.assignments.map(a => a.assignmentId)).toEqual(["a1"]);
    expect((await studentGet(studentAssignment, ctx, "b1")).status).toBe(404);
    expect((await studentGet(submission, ctx, "b1")).status).toBe(404);
    expect((await studentPost(ctx, "b1", { action: "startAttempt" })).status).toBe(404);
    expect((await runCode(ctx, "b1")).jsonBody.code).toBe("ASSIGNMENT_UNAVAILABLE");
    expect(ctx.mem.has(SUB("b1"))).toBe(false);
    const g = await gradebook(ctx, B, "b1");
    expect(g.students.map(s => s.studentId)).toEqual([S2]);
    expect((await teacherGet(results, ctx, B, "assignment-results?assignmentId=b1&studentId=" + S)).status).toBe(403);
  });
  it("an archived class is closed for the student, the other class stays open", async () => {
    const ctx = setup({ shared: true });
    ctx.mem.setJson("platform/classes/cA.json", cls("cA", A, { active: false, status: "archived", studentIds: [S] }));
    const r = await dash(ctx);
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(r.jsonBody.assignments.map(a => a.assignmentId)).toEqual(["b1"]);
    expect((await studentPost(ctx, "b1", { action: "startAttempt" })).status).toBe(200);
    expect((await studentPost(ctx, "a1", { action: "startAttempt" })).status).toBe(403);
    expect((await studentGet(studentAssignment, ctx, "a1")).status).toBe(403);
    ctx.mem.setJson("platform/classes/cB.json", cls("cB", B, { active: false, status: "archived", studentIds: [S, S2] }));
    expect((await dash(ctx)).status).toBe(403);                                                  // every class archived: as before
    expect((await studentPost(ctx, "b1", { action: "startAttempt" })).status).toBe(403);         // the archived SHARED class is closed too
    expect((await studentGet(studentAssignment, ctx, "b1")).status).toBe(403);
  });
});

describe("P11-A the owner adds existing students to another teacher's class", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });
  const FILE = [
    { firstName: "ليان", familyName: "سعيد", identityNumber: "300000001" },      // exists, teacher A
    { firstName: "كريم", familyName: "ناصر", identityNumber: "300000002" },       // already in cB
    { firstName: "جديد", familyName: "طالب", identityNumber: "300000009" }        // no account
  ];
  it("the preview tells an existing student apart (who, where) from a new one and from one already in the class; nothing written", async () => {
    const before = snapshot(ctx);
    const r = await owner(ctx, "preview-import", { classId: "cB", students: FILE });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ valid: 1, existing: 1, duplicates: 1, invalid: 0 });
    expect(r.jsonBody.preview.map(x => x.status)).toEqual(["existing", "duplicate", "valid"]);
    expect(r.jsonBody.preview[0].existingStudent).toMatchObject({ userId: S, displayName: "ليان سعيد", classId: "cA", className: "صف cA" });
    expect(snapshot(ctx)).toBe(before);
  });
  it("enroll: the same account joins the class — no new account, no password, no session revoked; roster index, owner audit", async () => {
    const authBefore = userDoc(ctx).authVersion;
    const r = await owner(ctx, "enroll-students", { classId: "cB", userIds: [S] });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, enrolled: 1, already: 0, failed: 0 });
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/password/i);
    const doc = userDoc(ctx);
    expect(doc).toMatchObject({ classId: "cA", ownerId: A, authVersion: authBefore, displayName: "ليان سعيد" });
    expect(doc.sharedClasses).toEqual([expect.objectContaining({ classId: "cB", addedBy: "owner:" + OWNER_ID })]);
    expect(ctx.mem.names("platform/users/")).toHaveLength(2);
    expect(ctx.mem.getJson("platform/classes/cB.json").studentIds).toContain(S);
    expect(ctx.mem.getJson("platform/classes/cA.json").studentIds).toContain(S);
    const audit = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
    expect(audit.map(e => e.action)).toContain("owner.students.enroll.requested");
    expect(JSON.stringify(audit)).not.toContain("300000001");                                    // never the identity number
    // the student now works in both classes, and B sees the student
    expect((await dash(ctx)).jsonBody.assignments.map(a => a.assignmentId).sort()).toEqual(["a1", "b1"]);
    expect((await roster(ctx, B, "cB")).map(s => s.userId)).toContain(S);
    expect((await ownerGet(ctx, "students", { classId: "cB" })).jsonBody.students.find(s => s.userId === S)).toMatchObject({ shared: true });
    expect((await ownerGet(ctx, "students", { classId: "cA" })).jsonBody.students.find(s => s.userId === S).shared).toBeFalsy();
  });
  it("enroll is idempotent; a student already in the class (home or shared) is 'already' and nothing is written twice", async () => {
    await owner(ctx, "enroll-students", { classId: "cB", userIds: [S] });
    const before = userDoc(ctx);
    const again = await owner(ctx, "enroll-students", { classId: "cB", userIds: [S, S2] });
    expect(again.jsonBody).toMatchObject({ enrolled: 0, already: 2, failed: 0 });
    expect(userDoc(ctx)).toEqual(before);
    expect(userDoc(ctx, S2).sharedClasses).toBeUndefined();
  });
  it("refusals — nothing written: no recent second-factor check, an archived or unknown class, an archived or unknown student, too many", async () => {
    const before = snapshot(ctx);
    expect((await owner(ctx, "enroll-students", { classId: "cB", userIds: [S] }, ctx.ownerStale)).status).toBe(403);
    expect((await owner(ctx, "enroll-students", { classId: "cBold", userIds: [S] })).jsonBody.code).toBe("CLASS_ARCHIVED");
    expect((await owner(ctx, "enroll-students", { classId: "nope", userIds: [S] })).status).toBe(404);
    expect((await owner(ctx, "enroll-students", { classId: "cB", userIds: [] })).status).toBe(400);
    expect((await owner(ctx, "enroll-students", { classId: "cB", userIds: Array.from({ length: 251 }, (_, i) => "u" + i) })).status).toBe(400);
    expect(snapshot(ctx).replace(/"stepUpAtMs":\s*\d+/g, "")).toBe(before.replace(/"stepUpAtMs":\s*\d+/g, ""));
    ctx.mem.setJson(USER(S), { ...userDoc(ctx), archived: true, active: false });
    const r = await owner(ctx, "enroll-students", { classId: "cB", userIds: [S, "33333333-3333-3333-3333-333333333333"] });
    expect(r.jsonBody).toMatchObject({ enrolled: 0, failed: 2 });
    expect(r.jsonBody.errors.map(e => e.code).sort()).toEqual(["STUDENT_ARCHIVED", "STUDENT_NOT_FOUND"]);
    expect(userDoc(ctx).sharedClasses).toBeUndefined();
  });
  it("a teacher token never reaches the owner's enrollment route", async () => {
    const before = snapshot(ctx);
    const r = await ownerClasses({ method: "POST", url: "https://x/api/owner-classes/enroll-students", params: { action: "enroll-students" }, headers: hdr({}), json: async () => ({ classId: "cB", userIds: [S] }) }, ctx.as(B));
    expect(r.status).toBe(401);
    expect(snapshot(ctx)).toBe(before);
  });
  it("the teacher's own import still cannot pull another teacher's student (identity taken, the student not named)", async () => {
    const before = snapshot(ctx);
    const pv = await teacherPost(students, ctx, B, { action: "previewImport", students: FILE });
    expect(pv.jsonBody.preview[0]).toMatchObject({ status: "duplicate", existingStudent: null });
    expect(pv.jsonBody.preview[0].error).not.toMatch(/ليان|سعيد|صف cA/);                          // neither the student nor the class is named
    const imp = await teacherPost(students, ctx, B, { action: "bulkImport", classId: "cB", students: [FILE[0]] });
    expect(imp.jsonBody).toMatchObject({ imported: 0, duplicates: 1 });
    // the teacher's OWN student in another class of theirs is a named duplicate, as before — never «existing» (only the owner enrolls)
    const own = await teacherPost(students, ctx, A, { action: "previewImport", students: [FILE[0]] });
    expect(own.jsonBody.preview[0]).toMatchObject({ status: "duplicate", existingStudent: expect.objectContaining({ userId: S, classId: "cA" }) });
    expect(own.jsonBody.preview[0].message).toBeUndefined();
    expect(snapshot(ctx)).toBe(before);
  });
});

describe("P11-A leaving a shared class", () => {
  let ctx;
  beforeEach(() => { ctx = setup({ shared: true, seedResults: true }); });
  it("the owner removes the student from the shared class; the account and the home class are untouched; B keeps the old result as an archive", async () => {
    const r = await owner(ctx, "unenroll-student", { classId: "cB", userId: S });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const doc = userDoc(ctx);
    expect(doc).toMatchObject({ classId: "cA", ownerId: A, sharedClasses: [] });
    expect(doc.sharedHistory.map(h => [h.classId, h.action])).toEqual([["cB", "removed"]]);
    expect(ctx.mem.getJson("platform/classes/cB.json").studentIds).not.toContain(S);
    expect(ctx.mem.getJson("platform/classes/cA.json").studentIds).toContain(S);
    expect(ctx.mem.getJson(SUB("b1")).attempts).toHaveLength(1);                                 // nothing deleted or rewritten
    expect((await dash(ctx)).jsonBody.assignments.map(a => a.assignmentId)).toEqual(["a1"]);
    const g = await gradebook(ctx, B, "b1");
    expect(g.students.map(s => s.studentId)).toEqual([S2]);
    expect(g.movedStudents).toEqual([expect.objectContaining({ studentId: S, movedOut: true, leftClass: true, latestResult: expect.objectContaining({ percentage: 60 }) })]);
    expect((await profile(ctx, B)).ok).not.toBe(true);
    expect(ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n).action)).toContain("owner.student.unenroll.requested");
  });
  it("teacher B removes the student from B's class; nobody else can (A, C, or from another class)", async () => {
    const before = snapshot(ctx);
    for (const [sub, classId] of [[A, "cB"], [C, "cB"], [B, "cB2"], [B, "cA"], [A, "cA"]]) {
      const r = await teacherPost(students, ctx, sub, { action: "unenroll", userId: S, classId });
      expect([sub, classId, r.status]).toEqual([sub, classId, 404]);
    }
    expect(snapshot(ctx)).toBe(before);
    const r = await teacherPost(students, ctx, B, { action: "unenroll", userId: S, classId: "cB" });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(userDoc(ctx).sharedClasses).toEqual([]);
    expect(userDoc(ctx).classId).toBe("cA");
  });
  it("refused while work in the shared class awaits its teacher (an open attempt or a result to review) — owner and teacher alike", async () => {
    for (const sub of [openAttempt(), awaitingReview()]) {
      ctx.mem.setJson(SUB("b1"), { assignmentId: "b1", studentId: S, classId: "cB", ...sub });
      const before = snapshot(ctx);
      const o = await owner(ctx, "unenroll-student", { classId: "cB", userId: S });
      expect([o.status, o.jsonBody.code]).toEqual([409, "PENDING_GRADING"]);
      const t = await teacherPost(students, ctx, B, { action: "unenroll", userId: S, classId: "cB" });
      expect([t.status, t.jsonBody.code]).toEqual([409, "PENDING_GRADING"]);
      expect(snapshot(ctx).replace(/"stepUpAtMs":\s*\d+/g, "")).toBe(before.replace(/"stepUpAtMs":\s*\d+/g, ""));
    }
  });
  it("an attempt started between the check and the write puts the student back (post-write re-check)", async () => {
    const { unenrollStudent, EnrollmentRefusal } = cjs("../src/lib/shared-enrollment.js");
    let calls = 0;
    const reader = () => ({ count: async () => (calls++ === 0 ? 0 : 1) });
    await expect(unenrollStudent(ctx.mem.container, "cB", S, { actor: "owner:x" }, { createPendingGradingReader: reader })).rejects.toBeInstanceOf(EnrollmentRefusal);
    expect(userDoc(ctx).sharedClasses.map(e => e.classId)).toEqual(["cB"]);
    expect(userDoc(ctx).sharedHistory || []).toEqual([]);
  });
});

describe("P11-A the home teacher's account actions and the shared class", () => {
  let ctx;
  beforeEach(() => { ctx = setup({ shared: true, seedResults: true }); });
  it("DELETE is refused while work awaits the teacher of the SHARED class (it could never be graded); an archive keeps that work in B's gradebook", async () => {
    ctx.mem.setJson(SUB("b1"), { assignmentId: "b1", studentId: S, classId: "cB", ...awaitingReview() });
    const before = snapshot(ctx);
    const r = await teacherPost(students, ctx, A, { action: "delete", userId: S });
    expect([r.status, r.jsonBody.code]).toEqual([409, "PENDING_GRADING"]);
    const bulk = await teacherPost(students, ctx, A, { action: "bulkAction", operation: "delete", userIds: [S] });
    expect(bulk.jsonBody).toMatchObject({ processed: 0, failed: 1, errors: [expect.objectContaining({ code: "PENDING_GRADING" })] });
    expect(snapshot(ctx)).toBe(before);
    expect((await teacherPost(students, ctx, A, { action: "archive", userId: S })).status).toBe(200);
    const g = await gradebook(ctx, B, "b1");
    expect(g.students.find(s => s.studentId === S).gradingStatus).toBe("pendingReview");          // still B's to grade
    expect(g.stats.pendingReview).toBe(1);
  });
  it("a delete with nothing pending removes the account from every class's roster index", async () => {
    const r = await teacherPost(students, ctx, A, { action: "delete", userId: S });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(userDoc(ctx)).toBeNull();
    expect(ctx.mem.getJson("platform/classes/cA.json").studentIds).not.toContain(S);
    expect(ctx.mem.getJson("platform/classes/cB.json").studentIds).not.toContain(S);
    expect((await gradebook(ctx, B, "b1")).students.map(s => s.studentId)).toEqual([S2]);
  });
  it("the home teacher still manages the account; an archived home student stays in B's gradebook", async () => {
    expect((await teacherPost(students, ctx, A, { action: "resetPassword", userId: S })).status).toBe(200);
    expect((await teacherPost(students, ctx, A, { action: "archive", userId: S })).status).toBe(200);
    expect(userDoc(ctx)).toMatchObject({ archived: true, active: false });
    expect((await gradebook(ctx, A, "a1")).students.map(s => s.studentId)).toEqual([]);          // as before: archived leaves the home roster
    expect((await gradebook(ctx, B, "b1")).students.map(s => s.studentId).sort()).toEqual([S, S2].sort());
    expect((await roster(ctx, B, "cB")).find(s => s.userId === S)).toMatchObject({ shared: true, active: false });
  });
  it("a class cannot be archived while a shared student's work awaits there", async () => {
    ctx.mem.setJson(SUB("b1"), { assignmentId: "b1", studentId: S, classId: "cB", ...openAttempt() });
    const r = await teacherPost(classrooms, ctx, B, { action: "archive", classId: "cB" });
    expect([r.status, r.jsonBody.code]).toEqual([409, "PENDING_GRADING"]);
  });
  it("reading B's roster never drops the shared student from the class's roster index (and repairs a missing one)", async () => {
    ctx.mem.setJson("platform/classes/cB.json", cls("cB", B, { studentIds: [S2], updatedAt: "2026-01-01T00:00:00.000Z" }));
    await roster(ctx, B, "cB");
    expect(ctx.mem.getJson("platform/classes/cB.json").studentIds.sort()).toEqual([S, S2].sort());
  });
  it("the owner's transfer INTO the shared class makes it the home class (no double membership)", async () => {
    const r = await owner(ctx, "student-transfer", { userId: S, fromClassId: "cA", toClassId: "cB" });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(userDoc(ctx)).toMatchObject({ classId: "cB", ownerId: B, sharedClasses: [] });
    expect((await roster(ctx, B, "cB")).find(s => s.userId === S).shared).toBeFalsy();
  });
  it("the home teacher moving the student INTO a class of theirs the student already shares makes it the home class (no double membership)", async () => {
    ctx.mem.setJson(USER(S), { ...userDoc(ctx), sharedClasses: [{ classId: "cA2", addedAt: "2026-10-01T00:00:00.000Z", addedBy: "owner:x" }, { classId: "cB", addedAt: "2026-10-01T00:00:00.000Z", addedBy: "owner:x" }] });
    expect((await roster(ctx, A, "cA2")).find(s => s.userId === S)).toMatchObject({ shared: true });   // shared between two classes of the SAME teacher
    const r = await teacherPost(students, ctx, A, { action: "bulkAction", operation: "move", userIds: [S], targetClassId: "cA2" });
    expect(r.jsonBody, JSON.stringify(r.jsonBody)).toMatchObject({ processed: 1, failed: 0 });
    const doc = userDoc(ctx);
    expect(doc.classId).toBe("cA2");
    expect(doc.sharedClasses.map(e => e.classId)).toEqual(["cB"]);
    expect((await roster(ctx, A, "cA2")).find(s => s.userId === S).shared).toBeFalsy();
  });
  it("the home teacher moving the student between their own classes keeps the shared class", async () => {
    ctx.mem.setJson(SUB("a1"), { assignmentId: "a1", studentId: S, classId: "cA", attempts: [finalAttempt(80)] });
    const r = await teacherPost(students, ctx, A, { action: "bulkAction", operation: "move", userIds: [S], targetClassId: "cA2" });
    expect(r.jsonBody, JSON.stringify(r.jsonBody)).toMatchObject({ processed: 1, failed: 0 });
    expect(userDoc(ctx)).toMatchObject({ classId: "cA2", sharedClasses: [expect.objectContaining({ classId: "cB" })] });
    expect((await roster(ctx, B, "cB")).map(s => s.userId)).toContain(S);
  });
});
