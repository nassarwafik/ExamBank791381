import { describe, it, expect } from "vitest";
import { handler as studentsHandler } from "../src/functions/manage-students.js";
import { handler as classroomsHandler } from "../src/functions/manage-classrooms.js";
import { studentCodeHash } from "../src/lib/student-auth.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase S.1 — grading safety of the roster on the server (AGENTS.md §10: never a silent "no answer"). Work still awaiting
// the teacher (a result not final, an open attempt) is never hidden by a roster change:
//   • a bulk move / archive re-checks the student's class INSIDE its write — a concurrent move to another class is a
//     409 CONCURRENT_MOVE for that row, never written over;
//   • a single or bulk DELETE honours PENDING_GRADING like archive and move, and refuses a student moved meanwhile;
//   • a class archive / graduation is refused (409 PENDING_GRADING) while a current member has such work.

const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const post = (url, body) => ({ method: "POST", url, json: async () => body });
const authName = code => "platform/auth/" + studentCodeHash(code) + ".json";
const OLD = "2020-01-01T00:00:00.000Z";
const user = (userId, classId, code, over = {}) => ({ userId, role: "student", active: true, archived: false, classId, displayName: "طالب " + userId, firstName: "طالب", familyName: userId, code, identityNumber: code, authVersion: 1, ...over });
const login = (userId, code) => ({ userId, codeHash: studentCodeHash(code), salt: "x", passwordHash: "y", active: true, authVersion: 1, createdAt: OLD });

const pending = (assignmentId, studentId) => ({ assignmentId, studentId, attempts: [{ attemptNumber: 1, score: 3, totalMarks: 10, percentage: 30, finalized: false }] });
const final = (assignmentId, studentId) => ({ assignmentId, studentId, attempts: [{ attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, finalized: true }] });
const open = (assignmentId, studentId) => ({ assignmentId, studentId, attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-10-01T08:00:00.000Z" } });

function seed(extra = {}) {
  return {
    "platform/classes/c1.json": { classId: "c1", name: "صف 1", grade: "الثاني عشر", schoolYear: "2026-2027", active: true, status: "active", studentIds: ["s1", "s2"] },
    "platform/classes/c2.json": { classId: "c2", name: "صف 2", grade: "العاشر", schoolYear: "2026-2027", active: true, status: "active", studentIds: [] },
    "platform/classes/c3.json": { classId: "c3", name: "صف 3", grade: "العاشر", schoolYear: "2026-2027", active: true, status: "active", studentIds: [] },
    "platform/users/s1.json": user("s1", "c1", "100000001"),
    "platform/users/s2.json": user("s2", "c1", "100000002"),
    [authName("100000001")]: login("s1", "100000001"),
    [authName("100000002")]: login("s2", "100000002"),
    "platform/assignments/a1.json": { assignmentId: "a1", classId: "c1", status: "published", title: "واجب الصف 1" },
    "platform/assignments/a3.json": { assignmentId: "a3", classId: "c3", status: "published", title: "واجب الصف 3" },
    ...extra
  };
}
function ctxOf(extra = {}, hooks = {}) {
  const ctx = createMemoryContainer(seed(extra), hooks);
  ctx.audit = [];
  ctx.deps = { ...AUTH, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { ctx.audit.push(ev); } };
  return ctx;
}
const students = (ctx, body) => studentsHandler(post("https://x/api/students", body), ctx.deps);
const classrooms = (ctx, body) => classroomsHandler(post("https://x/api/classrooms", body), ctx.deps);

/** A concurrent writer (another tab) moves `userId` to `classId` right before this request's compare-and-set on that user. */
function movedConcurrently(userId, classId) {
  let fired = false;
  return { beforeConditionalUpload(name, api) { if (fired || name !== "platform/users/" + userId + ".json") return; fired = true; api.setJson(name, { ...api.getJson(name), classId }); } };
}
const s1Pending3 = { "platform/submissions/a3/s1.json": pending("a3", "s1") };   // s1 has work awaiting the teacher in c3

describe("S.1 — a bulk move / archive never writes over a concurrent move", () => {
  it("bulk move: s1 was moved to c3 (work pending there) meanwhile → that row is 409 CONCURRENT_MOVE; s1 stays in c3", async () => {
    const ctx = ctxOf(s1Pending3, movedConcurrently("s1", "c3"));
    const r = await students(ctx, { action: "bulkAction", operation: "move", userIds: ["s1", "s2"], targetClassId: "c2" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.errors).toEqual([expect.objectContaining({ userId: "s1" })]);
    expect(r.jsonBody.errors[0].error).toContain("نقل الطالب إلى صف آخر في عملية أخرى");
    expect(ctx.getJson("platform/users/s1.json").classId).toBe("c3");                     // never written over
    expect(ctx.getJson("platform/users/s2.json").classId).toBe("c2");                     // the other row proceeds
    expect(ctx.audit.filter(e => e.action === "student.move").map(e => e.targetId)).toEqual(["s2"]);
  });

  it("bulk archive: s1 was moved to c3 (work pending there) meanwhile → 409 for that row; s1 is not archived", async () => {
    const ctx = ctxOf(s1Pending3, movedConcurrently("s1", "c3"));
    const r = await students(ctx, { action: "bulkAction", operation: "archive", userIds: ["s1"] });
    expect(r.jsonBody.errors).toEqual([expect.objectContaining({ userId: "s1" })]);
    const s1 = ctx.getJson("platform/users/s1.json");
    expect(s1.archived).toBe(false);
    expect(s1.classId).toBe("c3");
    expect(ctx.getJson(authName("100000001")).active).toBe(true);                          // login untouched
  });

  it("single archive: the same concurrent move → 409, nothing archived", async () => {
    const ctx = ctxOf(s1Pending3, movedConcurrently("s1", "c3"));
    const r = await students(ctx, { action: "archive", userId: "s1" });
    expect(r.status).toBe(409);
    expect(ctx.getJson("platform/users/s1.json").archived).toBe(false);
  });

  it("without a concurrent change both still work (move to c2, archive)", async () => {
    const ctx = ctxOf();
    expect((await students(ctx, { action: "bulkAction", operation: "move", userIds: ["s1"], targetClassId: "c2" })).jsonBody.processed).toBe(1);
    expect(ctx.getJson("platform/users/s1.json").classId).toBe("c2");
    expect((await students(ctx, { action: "bulkAction", operation: "archive", userIds: ["s2"] })).jsonBody.processed).toBe(1);
    expect(ctx.getJson("platform/users/s2.json").archived).toBe(true);
  });
});

describe("S.1 — delete honours PENDING_GRADING", () => {
  const s1Pending1 = { "platform/submissions/a1/s1.json": pending("a1", "s1") };
  it("single delete of a member with work awaiting the teacher → 409 PENDING_GRADING; the student and login remain", async () => {
    const ctx = ctxOf(s1Pending1);
    const r = await students(ctx, { action: "delete", userId: "s1" });
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("PENDING_GRADING");
    expect(r.jsonBody.error.startsWith("لا يمكن حذف الطالب الآن")).toBe(true);
    expect(r.jsonBody.error).toContain("عطّل حساب الطالب بدل حذفه");
    expect(ctx.getJson("platform/users/s1.json")).toBeTruthy();
    expect(ctx.getJson(authName("100000001"))).toBeTruthy();
    expect(ctx.audit.some(e => e.action === "student.delete")).toBe(false);
  });

  it("an OPEN attempt also blocks the delete", async () => {
    const ctx = ctxOf({ "platform/submissions/a1/s1.json": open("a1", "s1") });
    expect((await students(ctx, { action: "delete", userId: "s1" })).status).toBe(409);
    expect(ctx.getJson("platform/users/s1.json")).toBeTruthy();
  });

  it("bulk delete: the blocked row is a per-row PENDING_GRADING error, the other is deleted", async () => {
    const ctx = ctxOf(s1Pending1);
    const r = await students(ctx, { action: "bulkAction", operation: "delete", userIds: ["s1", "s2"] });
    expect(r.jsonBody.processed).toBe(1);
    expect(r.jsonBody.errors).toEqual([expect.objectContaining({ userId: "s1", code: "PENDING_GRADING" })]);
    expect(ctx.getJson("platform/users/s1.json")).toBeTruthy();
    expect(ctx.getJson("platform/users/s2.json")).toBeFalsy();
  });

  it("final results never block a delete; an ARCHIVED student (already outside the class's gradebook) can be deleted", async () => {
    const ctx = ctxOf({ "platform/submissions/a1/s1.json": final("a1", "s1"), "platform/users/s2.json": user("s2", "c1", "100000002", { archived: true, active: false }), "platform/submissions/a1/s2.json": pending("a1", "s2") });
    expect((await students(ctx, { action: "delete", userId: "s1" })).status).toBe(200);
    expect((await students(ctx, { action: "delete", userId: "s2" })).status).toBe(200);
    expect(ctx.getJson("platform/users/s1.json")).toBeFalsy();
    expect(ctx.getJson("platform/users/s2.json")).toBeFalsy();
  });

  it("a student moved to another class while the delete was being checked is refused (409), not deleted", async () => {
    const ctx = ctxOf(s1Pending3);
    // The delete reads the student, checks c1 (nothing pending), then re-reads before deleting: another tab moved s1 to c3.
    const getBlobClient = ctx.container.getBlobClient.bind(ctx.container);
    let reads = 0;
    ctx.container.getBlobClient = name => {
      const blob = getBlobClient(name);
      if (name !== "platform/users/s1.json") return blob;
      return { ...blob, download: async (...a) => { if (++reads === 2) ctx.setJson(name, { ...ctx.getJson(name), classId: "c3" }); return blob.download(...a); } };
    };
    const r = await students(ctx, { action: "delete", userId: "s1" });
    expect(r.status).toBe(409);
    expect(ctx.getJson("platform/users/s1.json").classId).toBe("c3");
    expect(ctx.getJson(authName("100000001"))).toBeTruthy();
  });
});

describe("S.1 — a class archive / graduation never hides a member's pending work", () => {
  it("archive with a member's result awaiting the teacher → 409 PENDING_GRADING; the class stays active", async () => {
    const ctx = ctxOf({ "platform/submissions/a1/s1.json": pending("a1", "s1") });
    const r = await classrooms(ctx, { action: "archive", classId: "c1" });
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("PENDING_GRADING");
    expect(r.jsonBody.error).toContain("أرشفة الصف");
    expect(ctx.getJson("platform/classes/c1.json").status).toBe("active");
    expect(ctx.audit.some(e => e.action === "class.archive")).toBe(false);
  });

  it("graduate-and-archive with a member's OPEN attempt → 409 PENDING_GRADING; nothing changes", async () => {
    const ctx = ctxOf({ "platform/submissions/a1/s2.json": open("a1", "s2") });
    const r = await classrooms(ctx, { action: "graduateAndArchive", classId: "c1" });
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("PENDING_GRADING");
    expect(ctx.getJson("platform/classes/c1.json").status).toBe("active");
    expect(ctx.getJson("platform/classes/c1.json").graduationYear).toBeFalsy();
  });

  it("final results, or pending work of a FORMER member (moved or archived), never block the class archive", async () => {
    const ctx = ctxOf({
      "platform/submissions/a1/s1.json": final("a1", "s1"),
      "platform/users/s2.json": user("s2", "c2", "100000002"),                            // moved out of c1
      "platform/submissions/a1/s2.json": pending("a1", "s2"),
      "platform/users/s4.json": user("s4", "c1", "100000004", { archived: true, active: false }),
      "platform/submissions/a1/s4.json": pending("a1", "s4")
    });
    const r = await classrooms(ctx, { action: "archive", classId: "c1" });
    expect(r.status).toBe(200);
    expect(ctx.getJson("platform/classes/c1.json").status).toBe("archived");
  });

  it("unarchive is never blocked", async () => {
    const ctx = ctxOf({ "platform/classes/c1.json": { classId: "c1", name: "صف 1", active: false, status: "archived", studentIds: [] }, "platform/submissions/a1/s1.json": pending("a1", "s1") });
    expect((await classrooms(ctx, { action: "unarchive", classId: "c1" })).status).toBe(200);
    expect(ctx.getJson("platform/classes/c1.json").status).toBe("active");
  });
});
