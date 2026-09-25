import { describe, it, expect } from "vitest";
import { isStudentClassMember } from "../src/lib/class-membership.js";
import { studentBelongsToClass, listClassStudents } from "../src/lib/project-tracker/service.js";
import { handler as resultsHandler } from "../src/functions/assignment-results.js";
import { handler as itemAnalysisHandler } from "../src/functions/assignment-item-analysis.js";
import { handler as studentHandler } from "../src/functions/manage-students.js";
import { handler as dashboardHandler } from "../src/functions/student-dashboard.js";
import { handler as loginHandler } from "../src/functions/platform-login.js";
import { computeTeacherAnalytics } from "../src/lib/teacher-analytics-core.js";
import { requireActiveStudentSession, studentCodeHash } from "../src/lib/student-auth.js";
import { downloadJsonOrNull, listJson } from "../src/lib/platform-storage.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Roadmap #24 — Canonical Class-Membership Predicate for Teacher Read Surfaces.
//
// "Is this student still a member of this class?" was answered differently across teacher read surfaces:
// roster/reports/project trackers said "role student, not archived, in class" while the gradebook
// (assignment-results), item analysis and teacher analytics also required `active !== false` — so a
// LOGIN-DISABLED (active:false, archived:false) student's gradebook row, pending review and historical
// results vanished. These tests drive the REAL handlers/core over the in-memory container with the real
// platform-storage helpers and prove: one predicate, disabled ⇒ still a member, archived ⇒ excluded, and
// student LOGIN eligibility (active:false blocks) unchanged.

const CP = "platform/classes/", UP = "platform/users/", AP = "platform/assignments/", SP = "platform/submissions/", AUTHP = "platform/auth/";
const T0 = "2026-03-01T10:00:00.000Z";
const AUTH_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const teacherDeps = ctx => ({ ...AUTH_OK, container: ctx.container, getContainer: () => ctx.container, downloadJsonOrNull, listJson, recordAuditEvent: async () => {} });

const student = (userId, classId, over = {}) => ({ userId, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "طالب " + userId, code: "10000000" + userId.slice(-1), identityNumber: "10000000" + userId.slice(-1), ...over });
const pendingAttempt = { attemptNumber: 1, submittedAt: T0, score: 6, totalMarks: 10, percentage: 60, manualReviewMarks: 4, finalized: false, questionGrades: [{ questionId: "q1", score: 6, maxMarks: 6, correct: true, manualReview: false }, { questionId: "q2", score: 0, maxMarks: 4, correct: false, manualReview: true }] };
const finalAttempt = { attemptNumber: 1, submittedAt: T0, score: 8, totalMarks: 10, percentage: 80, manualReviewMarks: 0, finalized: true, questionGrades: [{ questionId: "q1", score: 6, maxMarks: 6, correct: true, manualReview: false }, { questionId: "q2", score: 2, maxMarks: 4, correct: false, manualReview: false }] };
const sub = (assignmentId, studentId, classId, attempt) => ({ assignmentId, studentId, classId, attempts: [attempt], activeAttempt: null });

// Class c1 (active): sA normal (final), sB LOGIN-DISABLED (pending manual review), sC ARCHIVED (final),
// sD other class c2, sE non-student role sitting in c1, sF `active` missing (final). Assignment a1 in c1.
function seed() {
  return createMemoryContainer({
    [CP + "c1.json"]: { classId: "c1", name: "صف أ", active: true, status: "active", studentIds: ["sA", "sB", "sF"] },
    [CP + "c2.json"]: { classId: "c2", name: "صف ب", active: true, status: "active", studentIds: ["sD"] },
    [UP + "sA.json"]: student("sA", "c1"),
    [UP + "sB.json"]: student("sB", "c1", { active: false }),
    [UP + "sC.json"]: student("sC", "c1", { active: false, archived: true, archivedAt: T0 }),
    [UP + "sD.json"]: student("sD", "c2"),
    [UP + "sE.json"]: student("sE", "c1", { role: "teacher" }),
    [UP + "sF.json"]: (() => { const s = student("sF", "c1"); delete s.active; return s; })(),
    [AP + "a1.json"]: { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", dueAt: T0, createdAt: T0, maxAttempts: 1, totalMarks: 10, examSnapshot: { questions: [{ id: "q1", text: "س1", marks: 6, topic: "جبر" }, { id: "q2", text: "س2", marks: 4, topic: "هندسة" }] } },
    [SP + "a1/sA.json"]: sub("a1", "sA", "c1", finalAttempt),
    [SP + "a1/sB.json"]: sub("a1", "sB", "c1", pendingAttempt),
    [SP + "a1/sC.json"]: sub("a1", "sC", "c1", finalAttempt),
    [SP + "a1/sD.json"]: sub("a1", "sD", "c2", finalAttempt),
    [SP + "a1/sE.json"]: sub("a1", "sE", "c1", finalAttempt),
    [SP + "a1/sF.json"]: sub("a1", "sF", "c1", finalAttempt)
  });
}
const resultsGet = ctx => resultsHandler({ method: "GET", url: "https://x/api/assignment-results?assignmentId=a1", json: async () => ({}) }, teacherDeps(ctx));
const itemGet = ctx => itemAnalysisHandler({ method: "GET", url: "https://x/api/assignment-item-analysis?assignmentId=a1" }, teacherDeps(ctx));
const ids = body => body.students.map(s => s.studentId).sort();
const MEMBERS = ["sA", "sB", "sF"];   // normal + login-disabled + active-missing

describe("R24 #1 — canonical helper semantic matrix (A–G)", () => {
  const base = { userId: "s", role: "student", classId: "c1", active: true, archived: false };
  it("A normal active → included", () => expect(isStudentClassMember(base, "c1")).toBe(true));
  it("B login-disabled (active:false, archived:false) → INCLUDED", () => expect(isStudentClassMember({ ...base, active: false }, "c1")).toBe(true));
  it("C archived → excluded (with or without active)", () => {
    expect(isStudentClassMember({ ...base, archived: true }, "c1")).toBe(false);
    expect(isStudentClassMember({ ...base, active: false, archived: true }, "c1")).toBe(false);
    expect(isStudentClassMember({ ...base, active: true, archived: true }, "c1")).toBe(false);
  });
  it("D other class → excluded", () => expect(isStudentClassMember({ ...base, classId: "c2" }, "c1")).toBe(false));
  it("E non-student role → excluded", () => expect(isStudentClassMember({ ...base, role: "teacher" }, "c1")).toBe(false));
  it("F missing / invalid student → excluded", () => {
    expect(isStudentClassMember(null, "c1")).toBe(false);
    expect(isStudentClassMember(undefined, "c1")).toBe(false);
    expect(isStudentClassMember("sA", "c1")).toBe(false);
    expect(isStudentClassMember({ ...base, role: undefined }, "c1")).toBe(false);
  });
  it("G `active` missing, archived false → included", () => { const s = { ...base }; delete s.active; expect(isStudentClassMember(s, "c1")).toBe(true); });
  it("classId comparison is string-normalized; empty class never matches a real class", () => {
    expect(isStudentClassMember({ ...base, classId: 42 }, "42")).toBe(true);
    expect(isStudentClassMember({ ...base, classId: "" }, "c1")).toBe(false);
  });
  it("project-tracker studentBelongsToClass is the SAME rule (delegates, no second authority)", () => {
    for (const s of [base, { ...base, active: false }, { ...base, archived: true }, { ...base, classId: "c2" }, { ...base, role: "teacher" }, null]) {
      expect(studentBelongsToClass(s, "c1")).toBe(isStudentClassMember(s, "c1"));
    }
  });
});

describe("R24 #2–#5 — assignment-results (gradebook) population is canonical membership", () => {
  it("#2 includes the login-disabled student's row, result, pending-review status and stats", async () => {
    const r = await resultsGet(seed());
    expect(r.status).toBe(200);
    expect(ids(r.jsonBody)).toEqual(MEMBERS);
    const sB = r.jsonBody.students.find(s => s.studentId === "sB");
    expect(sB.gradingStatus).toBe("pendingReview");                 // R23/R14 authority untouched
    expect(sB.latestResult.percentage).toBe(60);
    expect(sB.attempts).toHaveLength(1);
    expect(r.jsonBody.stats).toMatchObject({ students: 3, submitted: 3, pendingReview: 1, finalized: 2, notSubmitted: 0, active: 0 });
    expect(r.jsonBody.stats.average).toBe(Number(((80 + 60 + 80) / 3).toFixed(1)));   // existing formula, now over members
  });
  it("#3 excludes the archived student (row and stats), #4 excludes other-class, #5 excludes non-student role", async () => {
    const r = await resultsGet(seed());
    expect(ids(r.jsonBody)).not.toContain("sC");
    expect(ids(r.jsonBody)).not.toContain("sD");
    expect(ids(r.jsonBody)).not.toContain("sE");
    expect(r.jsonBody.stats.students).toBe(3);
  });
  it("unrelated formulas unchanged: notSubmitted counts a member without a submission; active attempt independent of grading", async () => {
    const ctx = seed();
    ctx.setJson(UP + "sG.json", student("sG", "c1", { active: false }));                            // disabled, never submitted
    ctx.setJson(SP + "a1/sA.json", { ...sub("a1", "sA", "c1", finalAttempt), activeAttempt: { attemptNumber: 2, startedAt: T0, status: "started" } });
    const r = await resultsGet(ctx);
    expect(r.jsonBody.stats).toMatchObject({ students: 4, submitted: 3, notSubmitted: 1, pendingReview: 1, finalized: 2, active: 1 });
    expect(r.jsonBody.students.find(s => s.studentId === "sG").gradingStatus).toBe("notSubmitted");
  });
});

describe("R24 #6 — assignment-item-analysis population is canonical membership", () => {
  it("includes the disabled student's historical submission; excludes archived/other-class/non-student", async () => {
    const r = await itemGet(seed());
    expect(r.status).toBe(200);
    expect(r.jsonBody.studentsInClass).toBe(3);
    expect(r.jsonBody.studentsSubmitted).toBe(3);
    const q2 = r.jsonBody.questions.find(q => q.questionId === "q2");
    expect(q2.studentsAnalyzed).toBe(3);
    expect(q2.manualReviewCount).toBe(1);                            // only sB's (disabled) q2 is pending manual review
    expect(q2.averageScore).toBe(Number(((2 + 0 + 2) / 3).toFixed(2)));
  });
});

describe("R24 #7–#9 — teacher analytics population is canonical membership (R23 grading authority intact)", () => {
  it("#7 disabled student is in the population: expected/submitted/pending counts and averages include them", async () => {
    const d = await computeTeacherAnalytics(seed().container);
    expect(d.kpis.activeStudents).toBe(4);                            // global scope: sA, sB (disabled), sF in c1 + sD in c2; never sC (archived) / sE (teacher)
    expect(d.kpis.expectedSubmissions).toBe(3);
    expect(d.kpis.submissions).toBe(3);
    expect(d.kpis.pendingReview).toBe(1);                             // sB's pending manual review now visible (R23 rule)
    expect(d.kpis.average).toBe(Number(((80 + 60 + 80) / 3).toFixed(1)));
    expect(d.students.map(s => s.userId).sort()).toEqual(["sA", "sB", "sD", "sF"]);   // global scope: members of every class
    expect(d.classes.find(c => c.classId === "c1").studentCount).toBe(3);
    expect(d.classComparison.find(c => c.classId === "c1")).toMatchObject({ students: 3, submitted: 3, pendingReview: 1 });
  });
  it("#8 archived student excluded everywhere in analytics (population, per-class, trend)", async () => {
    const d = await computeTeacherAnalytics(seed().container, { classId: "c1" });
    expect(d.kpis.activeStudents).toBe(3);
    expect(d.students.map(s => s.userId)).not.toContain("sC");
    expect(d.students.map(s => s.userId)).not.toContain("sE");
    expect(d.assignmentTrend[0]).toMatchObject({ students: 3, submitted: 3, missing: 0, pendingReview: 1 });
    expect(d.studentDetail).toBeNull();
    // Phase 8A: an archived student is not a member → the student scope is REJECTED (never a silent class fallback).
    await expect(computeTeacherAnalytics(seed().container, { classId: "c1", studentId: "sC" })).rejects.toMatchObject({ name: "AnalyticsScopeError", httpStatus: 400 });
  });
  it("#9 analytics class population equals reports/project-tracker membership (listClassStudents) for the same data", async () => {
    const ctx = seed();
    const tracker = (await listClassStudents(ctx.container, "c1")).map(s => s.studentId).sort();
    const d = await computeTeacherAnalytics(ctx.container, { classId: "c1" });
    const results = await resultsGet(ctx);
    expect(tracker).toEqual(MEMBERS);
    expect(d.students.map(s => s.userId).sort()).toEqual(tracker);
    expect(d.kpis.activeStudents).toBe(tracker.length);
    expect(ids(results.jsonBody)).toEqual(tracker);
  });
  it("analytics still reports the login flag for display (active:false visible on the disabled student)", async () => {
    const d = await computeTeacherAnalytics(seed().container, { classId: "c1", studentId: "sB" });
    expect(d.studentDetail?.userId).toBe("sB");
    expect(d.followUp.concat(d.students).length).toBeGreaterThan(0);
  });
});

describe("R24 #10 — disabling login (real manage-students toggleactive) does not change historical grade visibility", () => {
  it("before/after toggleactive the gradebook row, pending review and item analysis are identical", async () => {
    const ctx = seed();
    ctx.setJson(AUTHP + studentCodeHash("100000001") + ".json", { userId: "sA", codeHash: studentCodeHash("100000001"), authVersion: 1, active: true, salt: "s", passwordHash: "h" });
    const before = await resultsGet(ctx);
    const r = await studentHandler({ method: "POST", url: "https://x/api/students", json: async () => ({ action: "toggleActive", userId: "sA" }) }, teacherDeps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.active).toBe(false);
    expect(ctx.getJson(UP + "sA.json").active).toBe(false);
    expect(ctx.getJson(UP + "sA.json").archived).toBe(false);
    const after = await resultsGet(ctx);
    expect(ids(after.jsonBody)).toEqual(ids(before.jsonBody));
    expect(after.jsonBody.stats).toEqual(before.jsonBody.stats);
    expect(after.jsonBody.students.find(s => s.studentId === "sA")).toEqual(before.jsonBody.students.find(s => s.studentId === "sA"));
    expect((await itemGet(ctx)).jsonBody.studentsInClass).toBe(3);
  });
});

describe("R24 #11 — student authentication remains BLOCKED for active:false (membership predicate never used for auth)", () => {
  const sessionDeps = (ctx, sub) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub, sv: 1, role: "student" } }) });
  it("requireActiveStudentSession rejects a login-disabled student and an archived student; accepts a normal one", async () => {
    const ctx = seed();
    expect((await requireActiveStudentSession({}, sessionDeps(ctx, "sB"))).ok).toBe(false);
    expect((await requireActiveStudentSession({}, sessionDeps(ctx, "sC"))).ok).toBe(false);
    expect((await requireActiveStudentSession({}, sessionDeps(ctx, "sA"))).ok).toBe(true);
  });
  it("student-dashboard returns 401 for the disabled student (no session, no data)", async () => {
    const ctx = seed();
    const r = await dashboardHandler({ method: "GET", url: "https://x/api/student-dashboard" }, sessionDeps(ctx, "sB"));
    expect(r.status).toBe(401);
  });
  it("platform-login refuses the disabled student even with a correct password (generic 401)", async () => {
    const ctx = seed();
    ctx.setJson(AUTHP + studentCodeHash("100000002") + ".json", { userId: "sB", codeHash: studentCodeHash("100000002"), authVersion: 1, active: true, salt: "s", passwordHash: "h" });
    const deps = { getContainer: () => ctx.container, downloadJsonOrNull, mutateJsonWithRetry: async () => { throw new Error("must not stamp lastLogin"); }, clientIdFromRequest: () => "ip1", validateBuilderCredentials: () => false, verifyPassword: () => true, reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {} };
    const r = await loginHandler({ json: async () => ({ userCode: "100000002", password: "correct" }) }, deps);
    expect(r.status).toBe(401);
    expect(r.jsonBody.ok).toBe(false);
  });
});

describe("R24 #12 — re-enabling a student produces no duplicate / double counting", () => {
  it("disable then re-enable via the real handler → population and stats identical, each student once", async () => {
    const ctx = seed();
    ctx.setJson(AUTHP + studentCodeHash("100000002") + ".json", { userId: "sB", codeHash: studentCodeHash("100000002"), authVersion: 1, active: false, salt: "s", passwordHash: "h" });
    const baseline = await resultsGet(ctx);
    const r1 = await studentHandler({ method: "POST", url: "https://x/api/students", json: async () => ({ action: "toggleActive", userId: "sB" }) }, teacherDeps(ctx));
    expect(r1.jsonBody.active).toBe(true);
    const enabled = await resultsGet(ctx);
    expect(ids(enabled.jsonBody)).toEqual(ids(baseline.jsonBody));
    expect(enabled.jsonBody.stats).toEqual(baseline.jsonBody.stats);
    expect(new Set(ids(enabled.jsonBody)).size).toBe(ids(enabled.jsonBody).length);
    const d = await computeTeacherAnalytics(ctx.container, { classId: "c1" });
    expect(d.students.map(s => s.userId).sort()).toEqual(MEMBERS);
    expect(d.kpis.expectedSubmissions).toBe(3);
    expect(ctx.getJson(CP + "c1.json").studentIds).toEqual(["sA", "sB", "sF"]);   // toggleactive never touches the roster index
  });
});
