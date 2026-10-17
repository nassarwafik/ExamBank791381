import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import { handler as studentsHandler } from "../src/functions/manage-students.js";
import { handler as classroomsHandler, normalizeClassFields } from "../src/functions/manage-classrooms.js";
import { studentCodeHash } from "../src/lib/student-auth.js";
import { normalizeIdentityNumber, cleanText, isSafeId } from "../src/lib/roster-input.js";
import { submissionNeedsTeacher } from "../src/lib/pending-grading.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Classes & Students hardening — every defect below was reproduced against the baseline (see the PR for the
// fail-first run); the remaining cases pin the new contract (class edit, cleaned labels) and the unchanged paths.

const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const post = (url, body) => ({ method: "POST", url, json: async () => body });
const get = url => ({ method: "GET", url });
const authName = code => "platform/auth/" + studentCodeHash(code) + ".json";
const OLD = "2020-01-01T00:00:00.000Z";

function seed(extra = {}) {
  return {
    "platform/classes/c1.json": { classId: "c1", name: "صف 1", grade: "العاشر", schoolYear: "2026-2027", active: true, status: "active", studentIds: ["s1", "s2"] },
    "platform/classes/c2.json": { classId: "c2", name: "صف 2", grade: "العاشر", schoolYear: "2026-2027", active: true, status: "active", studentIds: [] },
    "platform/classes/cArch.json": { classId: "cArch", name: "مؤرشف", active: false, status: "archived", studentIds: [] },
    "platform/users/s1.json": { userId: "s1", role: "student", active: true, archived: false, classId: "c1", displayName: "أحمد علي", firstName: "أحمد", familyName: "علي", code: "100000001", identityNumber: "100000001", authVersion: 1 },
    "platform/users/s2.json": { userId: "s2", role: "student", active: true, archived: false, classId: "c1", displayName: "سارة خالد", firstName: "سارة", familyName: "خالد", code: "100000002", identityNumber: "100000002", authVersion: 1 },
    [authName("100000001")]: { userId: "s1", codeHash: studentCodeHash("100000001"), salt: "x", passwordHash: "y", active: true, authVersion: 1, createdAt: OLD },
    [authName("100000002")]: { userId: "s2", codeHash: studentCodeHash("100000002"), salt: "x", passwordHash: "y", active: true, authVersion: 1, createdAt: OLD },
    ...extra
  };
}

function ctxOf(extra = {}, hooks = {}) {
  const ctx = createMemoryContainer(seed(extra), hooks);
  ctx.audit = [];
  ctx.deps = { ...AUTH, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { ctx.audit.push(ev); } };
  return ctx;
}
const students = (ctx, body, obs) => studentsHandler(post("https://x/api/students", body), ctx.deps, obs);
const classrooms = (ctx, body) => classroomsHandler(post("https://x/api/classrooms", body), ctx.deps);

// The storage SDK resolves "." / ".." segments of a blob name when it builds the request URL (verified against
// @azure/storage-blob: getBlobClient("platform/classes/../auth/x.json").url ends in /platform/auth/x.json). The
// memory container keys names verbatim, so this wrapper reproduces that resolution for the traversal tests.
function resolvingDotSegments(ctx) {
  const c = ctx.container;
  const blob = c.getBlobClient.bind(c), block = c.getBlockBlobClient.bind(c);
  c.getBlobClient = name => blob(path.posix.normalize(name));
  c.getBlockBlobClient = name => block(path.posix.normalize(name));
  return ctx;
}

describe("H1 — classId is a blob-name segment: traversal never reaches a document outside platform/classes/", () => {
  it("archive with classId '../auth/<hash>' is refused (400) and the student's login document is untouched", async () => {
    const ctx = resolvingDotSegments(ctxOf());
    const target = authName("100000001");
    const before = JSON.stringify(ctx.getJson(target));
    const r = await classrooms(ctx, { action: "archive", classId: "../auth/" + studentCodeHash("100000001") });
    expect(r.status).toBe(400);
    expect(JSON.stringify(ctx.getJson(target))).toBe(before);
    expect(ctx.getJson(target).active).toBe(true);
  });
  it("setPrograms / update with a traversal id are refused before any write", async () => {
    const ctx = resolvingDotSegments(ctxOf());
    const before = JSON.stringify([...ctx.names()].sort().map(n => [n, ctx.getJson(n)]));
    expect((await classrooms(ctx, { action: "setPrograms", classId: "../users/s1", programCodes: [] })).status).toBe(400);
    expect((await classrooms(ctx, { action: "update", classId: "../users/s1", name: "x" })).status).toBe(400);
    expect(JSON.stringify([...ctx.names()].sort().map(n => [n, ctx.getJson(n)]))).toBe(before);
  });
  it("a normal class id still works (archive → 200)", async () => {
    const ctx = ctxOf();
    const r = await classrooms(ctx, { action: "archive", classId: "c2" });
    expect(r.status).toBe(200);
    expect(ctx.getJson("platform/classes/c2.json").status).toBe("archived");
  });
  it("student endpoints treat a traversal id as an unknown student (pin)", async () => {
    const ctx = resolvingDotSegments(ctxOf());
    expect((await students(ctx, { action: "archive", userId: "../classes/c1" })).status).toBe(404);
    expect((await studentsHandler(get("https://x/api/students?profileUserId=..%2Fclasses%2Fc1"), ctx.deps)).status).toBe(404);
    expect(ctx.getJson("platform/classes/c1.json").status).toBe("active");
  });
  it("isSafeId accepts uuids / test ids and rejects separators", () => {
    expect(isSafeId("6f1c2d3e-aaaa-bbbb-cccc-123456789012")).toBe(true);
    expect(isSafeId("c1")).toBe(true);
    for (const bad of ["", "../x", "a/b", "a.b", "a b", "x".repeat(129)]) expect(isSafeId(bad)).toBe(false);
  });
});

describe("H2 — identity rename: the new credential is created first, the student document only after", () => {
  it("a taken target identity (orphan / foreign auth not visible to the pre-check) → 409 and NOTHING changes", async () => {
    // An auth document at the target path whose user document does not exist: findStudentByIdentity misses it.
    const ctx = ctxOf({ [authName("100000099")]: { userId: "ghost", codeHash: studentCodeHash("100000099"), salt: "g", passwordHash: "g", active: true, authVersion: 7, createdAt: OLD } });
    const before = JSON.stringify(ctx.getJson("platform/users/s1.json"));
    const r = await students(ctx, { action: "update", userId: "s1", firstName: "أحمد", familyName: "علي", identityNumber: "100000099", classId: "c1", password: "" });
    expect(r.status).toBe(409);
    expect(JSON.stringify(ctx.getJson("platform/users/s1.json"))).toBe(before);
    expect(ctx.has(authName("100000001"))).toBe(true);
    expect(ctx.getJson(authName("100000099")).userId).toBe("ghost");
  });
  it("a failed student write after the new credential was created removes that credential again", async () => {
    const ctx = ctxOf();
    const c = ctx.container, block = c.getBlockBlobClient.bind(c);
    c.getBlockBlobClient = name => {
      const client = block(name);
      if (name === "platform/users/s1.json") client.upload = async () => { const e = new Error("disk on fire"); e.statusCode = 500; throw e; };
      return client;
    };
    const r = await students(ctx, { action: "update", userId: "s1", firstName: "أحمد", familyName: "علي", identityNumber: "100000077", classId: "c1", password: "" });
    expect(r.status).toBe(500);
    expect(ctx.has(authName("100000077"))).toBe(false);
    expect(ctx.has(authName("100000001"))).toBe(true);
    expect(ctx.getJson("platform/users/s1.json").code).toBe("100000001");
  });
  it("a normal rename still moves the credential (pin)", async () => {
    const ctx = ctxOf();
    const r = await students(ctx, { action: "update", userId: "s1", firstName: "أحمد", familyName: "علي", identityNumber: "100000055", classId: "c1", password: "" });
    expect(r.status).toBe(200);
    expect(ctx.getJson("platform/users/s1.json").code).toBe("100000055");
    expect(ctx.has(authName("100000055"))).toBe(true);
    expect(ctx.has(authName("100000001"))).toBe(false);
  });
});

describe("M3 — an update never writes back a class a concurrent move already changed", () => {
  it("a move landing between the update's read and its write → 409, the moved class stays", async () => {
    let fired = false;
    const ctx = ctxOf({}, { beforeConditionalUpload(name, api) {
      if (fired || name !== "platform/users/s1.json") return;
      fired = true;
      api.setJson(name, { ...api.getJson(name), classId: "c2" });
    } });
    const r = await students(ctx, { action: "update", userId: "s1", firstName: "أحمد", familyName: "علي الجديد", identityNumber: "100000001", classId: "c1", password: "" });
    expect(fired).toBe(true);
    expect(r.status).toBe(409);
    expect(ctx.getJson("platform/users/s1.json").classId).toBe("c2");
  });
});

describe("M1 — orphan auth documents never block an identity forever", () => {
  it("an aged orphan (no user document) is reclaimed: the create succeeds", async () => {
    const ctx = ctxOf({ [authName("100000088")]: { userId: "ghost", salt: "g", passwordHash: "g", active: true, authVersion: 1, createdAt: OLD } });
    const r = await students(ctx, { action: "create", classId: "c1", firstName: "ليلى", familyName: "حسن", identityNumber: "100000088", password: "secret123" });
    expect(r.status).toBe(200);
    expect(ctx.getJson(authName("100000088")).userId).toBe(r.jsonBody.student.userId);
  });
  it("a fresh orphan (a create may still be between its two writes) is NOT reclaimed (pin)", async () => {
    const ctx = ctxOf({ [authName("100000088")]: { userId: "ghost", salt: "g", passwordHash: "g", active: true, authVersion: 1, createdAt: new Date().toISOString() } });
    const r = await students(ctx, { action: "create", classId: "c1", firstName: "ليلى", familyName: "حسن", identityNumber: "100000088", password: "secret123" });
    expect(r.status).toBe(409);
    expect(ctx.getJson(authName("100000088")).userId).toBe("ghost");
  });
  it("an auth document that belongs to a real student is never reclaimed (pin)", async () => {
    const ctx = ctxOf();
    const r = await students(ctx, { action: "create", classId: "c2", firstName: "س", familyName: "ص", identityNumber: "100000001", password: "secret123" });
    expect(r.status).toBe(409);
    expect(ctx.getJson(authName("100000001")).userId).toBe("s1");
  });
  it("a race winner's credential (its student exists) is never reclaimed, even when the pre-check missed it", async () => {
    // The duplicate pre-check reads the auth path BEFORE a concurrent create committed it (first read → 404); the
    // create-only write then conflicts and the reclaim must see that the credential has a real student.
    const ctx = ctxOf();
    const c = ctx.container, blob = c.getBlobClient.bind(c);
    let first = true;
    c.getBlobClient = name => {
      const cl = blob(name);
      if (name === authName("100000001") && first) { first = false; cl.download = async () => { const e = new Error("BlobNotFound"); e.statusCode = 404; e.code = "BlobNotFound"; throw e; }; }
      return cl;
    };
    const r = await students(ctx, { action: "create", classId: "c2", firstName: "س", familyName: "ص", identityNumber: "100000001", password: "secret123" });
    expect(r.status).toBe(409);
    expect(ctx.getJson(authName("100000001")).userId).toBe("s1");
  });
  it("a failed user-document write removes the auth document it just created (no new orphan)", async () => {
    const ctx = ctxOf();
    const c = ctx.container, block = c.getBlockBlobClient.bind(c);
    c.getBlockBlobClient = name => {
      const client = block(name);
      if (name.startsWith("platform/users/")) client.upload = async () => { const e = new Error("boom"); e.statusCode = 500; throw e; };
      return client;
    };
    const r = await students(ctx, { action: "create", classId: "c1", firstName: "ليلى", familyName: "حسن", identityNumber: "100000066", password: "secret123" });
    expect(r.status).toBe(500);
    expect(ctx.has(authName("100000066"))).toBe(false);
  });
});

describe("M4 — identity numbers: Arabic-Indic digits are digits; other characters are never silently dropped", () => {
  it("normalizeIdentityNumber maps ٠-٩ and ۰-۹, keeps separators, rejects letters", () => {
    expect(normalizeIdentityNumber("١٠٠٠٠٠٠٠٩")).toBe("100000009");
    expect(normalizeIdentityNumber("۱۰۰۰۰۰۰۰۹")).toBe("100000009");
    expect(normalizeIdentityNumber("12٣٤5٦789")).toBe("123456789");
    expect(normalizeIdentityNumber("123-456 789")).toBe("123456789");
    expect(normalizeIdentityNumber("12345678")).toBe("012345678");
    expect(normalizeIdentityNumber("12345678a")).not.toMatch(/^\d{9}$/);
    expect(normalizeIdentityNumber("")).toBe("");
  });
  it("create with Arabic-Indic digits stores the ASCII identity", async () => {
    const ctx = ctxOf();
    const r = await students(ctx, { action: "create", classId: "c1", firstName: "ليلى", familyName: "حسن", identityNumber: "١٠٠٠٠٠٠٠٩", password: "secret123" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.student.identityNumber).toBe("100000009");
  });
  it("create with a letter inside the identity → 400 (was silently stripped and zero-padded)", async () => {
    const ctx = ctxOf();
    const r = await students(ctx, { action: "create", classId: "c1", firstName: "ليلى", familyName: "حسن", identityNumber: "12345678a", password: "secret123" });
    expect(r.status).toBe(400);
  });
});

describe("M6 — credential-bearing responses are never cacheable", () => {
  it("create, bulkImport and bulk resetpasswords carry Cache-Control: no-store", async () => {
    const ctx = ctxOf();
    const created = await students(ctx, { action: "create", classId: "c1", firstName: "ليلى", familyName: "حسن", identityNumber: "100000044", password: "" });
    expect(created.status).toBe(200);
    expect(created.headers?.["Cache-Control"]).toBe("no-store");
    const imported = await students(ctx, { action: "bulkImport", classId: "c1", students: [{ firstName: "م", familyName: "ن", identityNumber: "100000045" }] });
    expect(imported.jsonBody.credentials.length).toBe(1);
    expect(imported.headers?.["Cache-Control"]).toBe("no-store");
    const reset = await students(ctx, { action: "bulkAction", operation: "resetpasswords", userIds: ["s1"] });
    expect(reset.jsonBody.credentials.length).toBe(1);
    expect(reset.headers?.["Cache-Control"]).toBe("no-store");
  });
});

describe("L3 / M9 — bulk actions: no silent truncation, no raw internal error text", () => {
  it("more than 250 ids → 400, nothing processed", async () => {
    const ctx = ctxOf();
    const ids = Array.from({ length: 251 }, (_, i) => "u" + i);
    const r = await students(ctx, { action: "bulkAction", operation: "deactivate", userIds: ids });
    expect(r.status).toBe(400);
  });
  it("a storage failure on one row reports a generic row message (logged), never the SDK text", async () => {
    const ctx = ctxOf();
    const c = ctx.container, blob = c.getBlobClient.bind(c);
    c.getBlobClient = name => {
      const cl = blob(name);
      if (name === "platform/users/s2.json") cl.download = async () => { const e = new Error("RequestId:abc-123 Time:2026 InternalError"); e.statusCode = 500; throw e; };
      return cl;
    };
    const obs = { logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() };
    const r = await students(ctx, { action: "bulkAction", operation: "deactivate", userIds: ["s1", "s2"] }, obs);
    expect(r.status).toBe(200);
    expect(r.jsonBody.processed).toBe(1);
    expect(r.jsonBody.errors).toHaveLength(1);
    expect(r.jsonBody.errors[0].error).not.toContain("RequestId");
    expect(r.jsonBody.errors[0].error).toBe("تعذر تنفيذ العملية لهذا الطالب.");
    expect(obs.logError).toHaveBeenCalled();
  });
});

describe("L1 / M5 — explicit login state + audit trail", () => {
  it("toggleActive with an explicit target state is idempotent and audited", async () => {
    const ctx = ctxOf();
    for (let i = 0; i < 2; i++) {
      const r = await students(ctx, { action: "toggleActive", userId: "s1", active: false });
      expect(r.jsonBody.active).toBe(false);
    }
    expect(ctx.getJson("platform/users/s1.json").active).toBe(false);
    expect(ctx.audit.filter(e => e.action === "student.setActive")).toHaveLength(2);
    expect(ctx.audit[0].details).toEqual({ active: false });
  });
  it("toggleActive without a target state keeps the legacy toggle (pin)", async () => {
    const ctx = ctxOf();
    expect((await students(ctx, { action: "toggleActive", userId: "s1" })).jsonBody.active).toBe(false);
    expect((await students(ctx, { action: "toggleActive", userId: "s1" })).jsonBody.active).toBe(true);
  });
  it("bulk activate/deactivate are audited", async () => {
    const ctx = ctxOf();
    await students(ctx, { action: "bulkAction", operation: "deactivate", userIds: ["s1", "s2"] });
    expect(ctx.audit.filter(e => e.action === "student.setActive" && e.details.bulk === true)).toHaveLength(2);
  });
  it("a profile edit records student.update with the changed field NAMES only (never the identity number)", async () => {
    const ctx = ctxOf();
    const r = await students(ctx, { action: "update", userId: "s1", firstName: "أحمد", familyName: "العلي", identityNumber: "100000033", classId: "c1", password: "" });
    expect(r.status).toBe(200);
    const ev = ctx.audit.find(e => e.action === "student.update");
    expect(ev.details).toEqual({ fields: ["familyName", "identityNumber"] });
    expect(JSON.stringify(ev)).not.toContain("100000033");
    expect(JSON.stringify(ev)).not.toContain("100000001");
  });
});

describe("M2 — grading safety: a move / archive never hides work still awaiting the teacher", () => {
  const assignment = { assignmentId: "a1", classId: "c1", status: "published", title: "واجب" };
  const pendingSubmission = { assignmentId: "a1", studentId: "s1", attempts: [{ attemptNumber: 1, score: 3, totalMarks: 10, percentage: 30, finalized: false }] };
  const finalSubmission = { assignmentId: "a1", studentId: "s1", attempts: [{ attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, finalized: true }] };
  const openSubmission = { assignmentId: "a1", studentId: "s1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-10-01T08:00:00.000Z" } };
  const withWork = submission => ({ "platform/assignments/a1.json": assignment, "platform/submissions/a1/s1.json": submission });

  it("submissionNeedsTeacher: pending review and open attempts need the teacher; final results do not", () => {
    expect(submissionNeedsTeacher(pendingSubmission)).toBe(true);
    expect(submissionNeedsTeacher(openSubmission)).toBe(true);
    expect(submissionNeedsTeacher({ attempts: [{ manualReviewMarks: 2, finalized: true }] })).toBe(true);
    expect(submissionNeedsTeacher(finalSubmission)).toBe(false);
    expect(submissionNeedsTeacher(null)).toBe(false);
  });
  it("move through update → 409 PENDING_GRADING, nothing changed", async () => {
    const ctx = ctxOf(withWork(pendingSubmission));
    const r = await students(ctx, { action: "update", userId: "s1", firstName: "أحمد", familyName: "علي", identityNumber: "100000001", classId: "c2", password: "" });
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("PENDING_GRADING");
    expect(r.jsonBody.pendingCount).toBe(1);
    expect(ctx.getJson("platform/users/s1.json").classId).toBe("c1");
  });
  it("an open attempt also blocks the move", async () => {
    const ctx = ctxOf(withWork(openSubmission));
    const r = await students(ctx, { action: "update", userId: "s1", firstName: "أحمد", familyName: "علي", identityNumber: "100000001", classId: "c2", password: "" });
    expect(r.status).toBe(409);
  });
  it("single archive → 409 PENDING_GRADING, student stays a member", async () => {
    const ctx = ctxOf(withWork(pendingSubmission));
    const r = await students(ctx, { action: "archive", userId: "s1" });
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("PENDING_GRADING");
    expect(ctx.getJson("platform/users/s1.json").archived).toBe(false);
  });
  it("bulk move / archive: the blocked row is a per-row PENDING_GRADING error, the others proceed", async () => {
    const ctx = ctxOf(withWork(pendingSubmission));
    const moved = await students(ctx, { action: "bulkAction", operation: "move", userIds: ["s1", "s2"], targetClassId: "c2" });
    expect(moved.jsonBody.processed).toBe(1);
    expect(moved.jsonBody.errors).toEqual([expect.objectContaining({ userId: "s1", code: "PENDING_GRADING" })]);
    expect(ctx.getJson("platform/users/s1.json").classId).toBe("c1");
    expect(ctx.getJson("platform/users/s2.json").classId).toBe("c2");
    const archived = await students(ctx, { action: "bulkAction", operation: "archive", userIds: ["s1"] });
    expect(archived.jsonBody.errors[0].code).toBe("PENDING_GRADING");
  });
  it("finalized work does not block (pin), and login-disabling stays allowed", async () => {
    const ctx = ctxOf(withWork(finalSubmission));
    expect((await students(ctx, { action: "update", userId: "s1", firstName: "أحمد", familyName: "علي", identityNumber: "100000001", classId: "c2", password: "" })).status).toBe(200);
    const ctx2 = ctxOf(withWork(pendingSubmission));
    expect((await students(ctx2, { action: "toggleActive", userId: "s1", active: false })).status).toBe(200);
  });
  it("work of ANOTHER class never blocks the move (pin)", async () => {
    const ctx = ctxOf({ "platform/assignments/a1.json": { ...assignment, classId: "c2" }, "platform/submissions/a1/s1.json": pendingSubmission });
    expect((await students(ctx, { action: "archive", userId: "s1" })).status).toBe(200);
  });
});

describe("L7 — names and class labels are cleaned and bounded", () => {
  it("cleanText: NFC, bidi overrides / zero-width removed, whitespace collapsed; ZWNJ kept", () => {
    expect(cleanText("  ‮أحمد‬   علي​ ")).toBe("أحمد علي");
    expect(cleanText("می‌خواهم")).toBe("می‌خواهم");
    expect(cleanText("é")).toBe("é");
  });
  it("create stores the cleaned names; an over-long name → 400", async () => {
    const ctx = ctxOf();
    const r = await students(ctx, { action: "create", classId: "c1", firstName: "‮ليلى", familyName: "حسن   الكبير", identityNumber: "100000022", password: "secret123" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.student.displayName).toBe("ليلى حسن الكبير");
    const long = await students(ctx, { action: "create", classId: "c1", firstName: "ا".repeat(61), familyName: "ب", identityNumber: "100000023", password: "secret123" });
    expect(long.status).toBe(400);
  });
  it("an over-long password is rejected before hashing", async () => {
    const ctx = ctxOf();
    const r = await students(ctx, { action: "create", classId: "c1", firstName: "س", familyName: "ص", identityNumber: "100000024", password: "p".repeat(129) });
    expect(r.status).toBe(400);
  });
  it("normalizeClassFields bounds and cleans class labels", () => {
    expect(normalizeClassFields({ name: " ‮العاشر  1 ", grade: "العاشر", schoolYear: "2026-2027" })).toEqual({ ok: true, value: { name: "العاشر 1", grade: "العاشر", schoolYear: "2026-2027" } });
    expect(normalizeClassFields({ name: "" }).ok).toBe(false);
    expect(normalizeClassFields({ name: "x".repeat(81) }).ok).toBe(false);
  });
});

describe("L5 — class details can be edited (new action)", () => {
  it("update renames the class, keeps roster / lifecycle / materials, and is audited", async () => {
    const ctx = ctxOf({ "platform/classes/c1.json": { classId: "c1", name: "صف 1", grade: "العاشر", schoolYear: "2026-2027", active: true, status: "active", studentIds: ["s1", "s2"], programCodes: ["794589"], learningMaterials: [{ courseId: "k", visibleModuleIds: [] }] } });
    const r = await classrooms(ctx, { action: "update", classId: "c1", name: "العاشر أ", grade: "العاشر", schoolYear: "2026-2027" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.changed).toBe(true);
    const doc = ctx.getJson("platform/classes/c1.json");
    expect(doc.name).toBe("العاشر أ");
    expect(doc.studentIds).toEqual(["s1", "s2"]);
    expect(doc.programCodes).toEqual(["794589"]);
    expect(doc.learningMaterials).toEqual([{ courseId: "k", visibleModuleIds: [] }]);
    expect(ctx.audit.find(e => e.action === "class.update").details).toEqual({ fields: ["name"], previousName: "صف 1" });
  });
  it("unchanged values write and audit nothing; archived → 403; unknown → 404; empty name → 400", async () => {
    const ctx = ctxOf();
    const same = await classrooms(ctx, { action: "update", classId: "c1", name: "صف 1", grade: "العاشر", schoolYear: "2026-2027" });
    expect(same.jsonBody.changed).toBe(false);
    expect(ctx.audit).toHaveLength(0);
    expect((await classrooms(ctx, { action: "update", classId: "cArch", name: "x" })).status).toBe(403);
    expect((await classrooms(ctx, { action: "update", classId: "nope", name: "x" })).status).toBe(404);
    expect((await classrooms(ctx, { action: "update", classId: "c1", name: "  " })).status).toBe(400);
  });
  it("another teacher's class is reported as missing (tenancy)", async () => {
    const ctx = ctxOf({ "platform/classes/cOther.json": { classId: "cOther", ownerId: "teacher-2", name: "x", active: true, status: "active", studentIds: [] } });
    ctx.deps.requireBuilderAuth = () => ({ ok: true, user: { sub: "teacher-1", am: "multi-user" } });
    expect((await classrooms(ctx, { action: "update", classId: "cOther", name: "y" })).status).toBe(404);
    expect(ctx.getJson("platform/classes/cOther.json").name).toBe("x");
  });
});
