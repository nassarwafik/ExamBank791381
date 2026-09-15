import { describe, it, expect, beforeEach } from "vitest";
import { normalizeClassStatus, applyClassLifecycleAction } from "../src/lib/class-lifecycle.js";
import { handler as classHandler } from "../src/functions/manage-classrooms.js";
import { handler as studentHandler } from "../src/functions/manage-students.js";
import { handler as assignmentHandler } from "../src/functions/manage-assignments.js";
import { handler as resultsHandler } from "../src/functions/assignment-results.js";
import { handler as reviewHandler } from "../src/functions/assignment-review.js";
import { handler as dashboardHandler } from "../src/functions/student-dashboard.js";
import { handler as studentAssignmentHandler } from "../src/functions/student-assignment.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Roadmap #20 — Class Lifecycle. Pure helper tests (AL–AP) plus handler-level gate/read tests (AQ–AZ)
// driven over the faithful in-memory container with the REAL storage helpers, so the ACTUAL server gates
// (not stubs) are exercised.

const BUILDER = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
function builderDeps(ctx, extra = {}) { return { ...BUILDER, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, ...extra }; }

// ── AL–AP: pure normalization + transitions ─────────────────────────────────────────────────────────────
describe("R20 AL/AM/AN: status normalization", () => {
  it("AL: a legacy active class (active:true, no status) normalizes to active", () => {
    expect(normalizeClassStatus({ active: true })).toBe("active");
    expect(normalizeClassStatus({})).toBe("active");
  });
  it("AM: active:false normalizes to archived", () => {
    expect(normalizeClassStatus({ active: false })).toBe("archived");
  });
  it("AN: status:archived normalizes to archived", () => {
    expect(normalizeClassStatus({ status: "archived", active: true })).toBe("archived");
  });
});

describe("R20 AO/AP: graduate + unarchive transitions preserve data", () => {
  const base = { classId: "c1", name: "صف", schoolYear: "2026-2027", active: true, studentIds: ["s1", "s2"] };
  it("AO: graduate sets archiveReason=graduated + graduationYear, archived", () => {
    const next = applyClassLifecycleAction(base, "graduateandarchive", { actor: "t", now: "2027-06-01T00:00:00.000Z" });
    expect(normalizeClassStatus(next)).toBe("archived");
    expect(next.archiveReason).toBe("graduated");
    expect(next.graduationYear).toBe("2027");
    expect(next.studentIds).toEqual(["s1", "s2"]);                    // roster preserved
  });
  it("AP: unarchive returns to active and clears ONLY the lifecycle archive fields (roster preserved)", () => {
    const archived = applyClassLifecycleAction(base, "archive", { actor: "t", now: "2027-06-01T00:00:00.000Z" });
    const restored = applyClassLifecycleAction(archived, "unarchive", { actor: "t", now: "2027-09-01T00:00:00.000Z" });
    expect(normalizeClassStatus(restored)).toBe("active");
    expect(restored.active).toBe(true);
    expect(restored.archivedAt).toBeUndefined();
    expect(restored.archiveReason).toBeUndefined();
    expect(restored.graduationYear).toBeUndefined();
    expect(restored.studentIds).toEqual(["s1", "s2"]);
  });
});

// ── AQ/AR/AS: student runtime gates (archived class => 403) ─────────────────────────────────────────────
function studentSession(ctx, student) { return { requireActiveStudentSession: async () => ({ ok: true, user: { sub: student.userId, sv: 1 }, student, container: ctx.container }) }; }
const archivedClass = { classId: "cA", name: "مؤرشف", active: false, status: "archived", studentIds: [] };

describe("R20 AQ/AR/AS: archived class blocks the student runtime", () => {
  let ctx, student;
  beforeEach(() => {
    ctx = createMemoryContainer();
    ctx.setJson("platform/classes/cA.json", archivedClass);
    student = { userId: "s1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "علي", code: "S1" };
    ctx.setJson("platform/users/s1.json", student);
    ctx.setJson("platform/assignments/a1.json", { assignmentId: "a1", classId: "cA", status: "published", title: "واجب", maxAttempts: 1, examSnapshot: { questions: [] } });
  });
  it("AQ: student-dashboard => 403", async () => {
    const r = await dashboardHandler({ method: "GET", url: "https://x/api/student-dashboard" }, studentSession(ctx, student));
    expect(r.status).toBe(403);
  });
  it("AR: student-assignment => 403", async () => {
    const r = await studentAssignmentHandler({ method: "GET", url: "https://x/api/student-assignment/a1", params: { assignmentId: "a1" } }, studentSession(ctx, student));
    expect(r.status).toBe(403);
  });
  it("AS: save/submit => 403 (no write)", async () => {
    const save = await submissionHandler({ method: "POST", url: "https://x/api/student-submission/a1", params: { assignmentId: "a1" }, json: async () => ({ action: "saveDraft", answers: {} }) }, studentSession(ctx, student));
    expect(save.status).toBe(403);
    const submit = await submissionHandler({ method: "POST", url: "https://x/api/student-submission/a1", params: { assignmentId: "a1" }, json: async () => ({ action: "submit", answers: {} }) }, studentSession(ctx, student));
    expect(submit.status).toBe(403);
    expect(ctx.has("platform/submissions/a1/s1.json")).toBe(false);   // nothing written
  });
});

// ── AT/AV/AW: teacher mutation gates (archived class rejects new active work) ───────────────────────────
describe("R20 AT/AV/AW: teacher mutations into an archived class are rejected", () => {
  let ctx;
  beforeEach(() => {
    ctx = createMemoryContainer();
    ctx.setJson("platform/classes/cA.json", archivedClass);
    ctx.setJson("platform/classes/cLive.json", { classId: "cLive", name: "نشط", active: true, studentIds: [] });
  });
  const stuReq = (action, body) => ({ method: "POST", url: "https://x/api/students", json: async () => ({ action, ...body }) });
  const asgReq = (action, body) => ({ method: "POST", url: "https://x/api/assignments", json: async () => ({ action, ...body }) });

  it("AT: create student into an archived class => rejected", async () => {
    const r = await studentHandler(stuReq("create", { classId: "cA", firstName: "علي", familyName: "حسن", identityNumber: "123456789" }), builderDeps(ctx));
    expect(r.status).toBe(400);
    expect(ctx.names("platform/users/")).toHaveLength(0);
  });

  it("AV: moving a student INTO an archived class (profile update) => rejected", async () => {
    // seed a live student
    ctx.setJson("platform/users/s1.json", { userId: "s1", role: "student", active: true, archived: false, authVersion: 1, classId: "cLive", displayName: "علي حسن", code: "123456789", identityNumber: "123456789" });
    ctx.setJson("platform/auth/" + require("../src/lib/student-auth.js").studentCodeHash("123456789") + ".json", { userId: "s1", codeHash: require("../src/lib/student-auth.js").studentCodeHash("123456789"), authVersion: 1, active: true });
    const r = await studentHandler(stuReq("update", { userId: "s1", firstName: "علي", familyName: "حسن", identityNumber: "123456789", classId: "cA" }), builderDeps(ctx));
    expect(r.status).toBe(400);                                        // "الصف الجديد غير موجود أو مؤرشف."
    expect(ctx.getJson("platform/users/s1.json").classId).toBe("cLive"); // unchanged
  });

  it("AW: creating AND publishing an assignment targeting an archived class => rejected", async () => {
    const created = await assignmentHandler(asgReq("create", { classId: "cA", title: "واجب", examSnapshot: { questions: [{ id: "q1", text: "س", marks: 5 }] } }), builderDeps(ctx));
    expect(created.status).toBe(400);
    // A draft assignment already in an archived class cannot be flipped to published either.
    ctx.setJson("platform/assignments/aD.json", { assignmentId: "aD", classId: "cA", status: "draft", title: "مسودة", maxAttempts: 1, examSnapshot: { questions: [] } });
    const published = await assignmentHandler(asgReq("setStatus", { assignmentId: "aD", status: "published" }), builderDeps(ctx));
    expect(published.status).toBe(409);
    expect(ctx.getJson("platform/assignments/aD.json").status).toBe("draft"); // never published
  });
});

// ── AX/AY: teacher reads for an archived class remain available ─────────────────────────────────────────
describe("R20 AX/AY: results + review reads stay readable for an archived class", () => {
  let ctx;
  beforeEach(() => {
    ctx = createMemoryContainer();
    ctx.setJson("platform/classes/cA.json", archivedClass);
    ctx.setJson("platform/users/s1.json", { userId: "s1", role: "student", classId: "cA", displayName: "علي", code: "S1", active: true });
    ctx.setJson("platform/assignments/a1.json", { assignmentId: "a1", classId: "cA", status: "published", title: "واجب", totalMarks: 10, maxAttempts: 1, examSnapshot: { questions: [{ questionId: "q1", text: "س", marks: 10 }] } });
    ctx.setJson("platform/submissions/a1/s1.json", { assignmentId: "a1", studentId: "s1", classId: "cA", attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T00:00:00.000Z", score: 8, totalMarks: 10, percentage: 80, manualReviewMarks: 0, finalized: true, questionGrades: [{ questionId: "q1", score: 8 }], answers: { q1: { kind: "text", value: "x" } } }] });
  });
  it("AX: assignment-results GET returns the roster for an archived class", async () => {
    const r = await resultsHandler({ method: "GET", url: "https://x/api/assignment-results?assignmentId=a1" }, builderDeps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.students.length).toBe(1);
  });
  it("AY: assignment-review GET returns the attempt for an archived class", async () => {
    const r = await reviewHandler({ method: "GET", url: "https://x/api/assignment-review?assignmentId=a1&studentId=s1&attemptNumber=1" }, builderDeps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.attempt.attemptNumber).toBe(1);
  });
});

// ── AZ: unarchiving a class does not touch assignments/attempts/grades/students ─────────────────────────
describe("R20 AZ: unarchive is a lifecycle-only transition (no data change)", () => {
  it("leaves assignment/submission/student documents byte-identical after archive->unarchive", async () => {
    const ctx = createMemoryContainer();
    ctx.setJson("platform/classes/c1.json", { classId: "c1", name: "صف", active: true, studentIds: ["s1"] });
    ctx.setJson("platform/users/s1.json", { userId: "s1", role: "student", classId: "c1", displayName: "علي", code: "S1", active: true, authVersion: 1 });
    ctx.setJson("platform/assignments/a1.json", { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", maxAttempts: 1 });
    ctx.setJson("platform/submissions/a1/s1.json", { assignmentId: "a1", studentId: "s1", classId: "c1", attempts: [{ attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, finalized: true }] });
    const snap = k => JSON.stringify(ctx.getJson(k));
    const beforeUser = snap("platform/users/s1.json"), beforeAsg = snap("platform/assignments/a1.json"), beforeSub = snap("platform/submissions/a1/s1.json");
    const clsReq = (action) => ({ method: "POST", url: "https://x/api/classrooms", json: async () => ({ action, classId: "c1" }) });
    await classHandler(clsReq("archive"), builderDeps(ctx));
    await classHandler(clsReq("unarchive"), builderDeps(ctx));
    expect(normalizeClassStatus(ctx.getJson("platform/classes/c1.json"))).toBe("active");
    expect(ctx.getJson("platform/classes/c1.json").studentIds).toEqual(["s1"]);   // roster kept
    expect(snap("platform/users/s1.json")).toBe(beforeUser);
    expect(snap("platform/assignments/a1.json")).toBe(beforeAsg);
    expect(snap("platform/submissions/a1/s1.json")).toBe(beforeSub);              // grades untouched
  });
});
