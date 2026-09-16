import { describe, it, expect, vi } from "vitest";
import { handler, StudentActionError } from "../src/functions/manage-students.js";
import { studentCodeHash } from "../src/lib/student-auth.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Roadmap #29 — Teacher Student-Management Error Semantics.
//
// Pre-R29, a teacher's own input mistake or a state precondition (duplicate identity, short password, activating
// an archived student, restoring a student into an archived class, …) was thrown as a plain Error inside the
// helpers, fell into the handler's generic catch and came back as 500 "تعذر تنفيذ إجراء الطالب حاليًا." — logged as a
// server error. These tests drive the REAL handler over the in-memory container and pin: the exact 4xx status +
// the unchanged Arabic message per case, no unintended storage mutation on rejection, genuine storage failures
// still 500 (logError), credential-lock contention still 409, bulk paths byte-for-byte unchanged, and that no
// plaintext password or student-naming message ever reaches the logs.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GENERIC_500 = "تعذر تنفيذ إجراء الطالب حاليًا.";
const PW = "secret123";
const AUTH_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const deps = ctx => ({ ...AUTH_OK, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const post = body => ({ method: "POST", url: "https://x/api/students", json: async () => body });
const obsSpy = () => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() });
const run = (ctx, body, obs) => handler(post(body), deps(ctx), obs);
const snapshot = ctx => JSON.stringify([...ctx.names()].sort().map(n => [n, ctx.getJson(n)]));
// The reset/update paths take the per-student credential lease; the memory container has no lease API, so give
// it a pass-through lease (real lease semantics are covered by auth-hardening-r8).
function withLease(ctx) {
  const c = ctx.container, orig = c.getBlobClient.bind(c);
  c.getBlobClient = name => { const cl = orig(name); cl.getBlobLeaseClient = () => ({ acquireLease: async () => {}, releaseLease: async () => {} }); return cl; };
  return ctx;
}
function seed() {
  const s = {
    "platform/classes/c1.json": { classId: "c1", name: "صف 1", active: true, status: "active", studentIds: ["s1", "s2"], updatedAt: "2026-01-01T00:00:00.000Z" },
    "platform/classes/cArch.json": { classId: "cArch", name: "صف مؤرشف", active: false, status: "archived", studentIds: ["s3"], updatedAt: "2026-01-01T00:00:00.000Z" },
    "platform/users/s1.json": { userId: "s1", role: "student", active: true, archived: false, classId: "c1", displayName: "أحمد علي", firstName: "أحمد", familyName: "علي", code: "100000001", identityNumber: "100000001", authVersion: 1 },
    "platform/users/s2.json": { userId: "s2", role: "student", active: false, archived: true, classId: "c1", displayName: "سارة خالد", firstName: "سارة", familyName: "خالد", code: "100000002", identityNumber: "100000002", authVersion: 1 },
    "platform/users/s3.json": { userId: "s3", role: "student", active: false, archived: true, classId: "cArch", displayName: "ليلى", firstName: "ليلى", familyName: "حسن", code: "100000003", identityNumber: "100000003", authVersion: 1 },
    "platform/users/s4.json": { userId: "s4", role: "student", active: true, archived: false, classId: "c1", displayName: "بلا ملف دخول", firstName: "ب", familyName: "د", code: "100000004", identityNumber: "100000004", authVersion: 1 }
  };
  for (const id of ["s1", "s2", "s3"]) s["platform/auth/" + studentCodeHash("10000000" + id.slice(1)) + ".json"] = { userId: id, codeHash: studentCodeHash("10000000" + id.slice(1)), salt: "x", passwordHash: "y", active: id === "s1", authVersion: 1 };
  return s;
}
const ctxOf = (extra = {}) => createMemoryContainer({ ...seed(), ...extra });
// Runs a request expected to be REJECTED and asserts status/message, no-store (typed rejections only — the
// pre-existing inline 4xx returns are left exactly as they were), and (optionally) no storage change.
async function rejected(ctx, body, status, message, { unchanged = true, noStore = true, obs = obsSpy() } = {}) {
  const before = snapshot(ctx);
  const r = await run(ctx, body, obs);
  expect(r.status).toBe(status);
  expect(r.jsonBody).toEqual({ ok: false, error: message });
  if (noStore) expect(r.headers?.["Cache-Control"]).toBe("no-store");
  if (unchanged) expect(snapshot(ctx)).toBe(before);
  return { r, obs };
}

describe("A. create — teacher input errors are 4xx with the existing Arabic message", () => {
  it("A1 missing name → 400", async () => {
    await rejected(ctxOf(), { action: "create", classId: "c1", firstName: "", familyName: "", identityNumber: "100000009", password: PW }, 400, "يجب إدخال الاسم الشخصي واسم العائلة.");
  });
  it("A2 malformed identity (11 digits) → 400", async () => {
    await rejected(ctxOf(), { action: "create", classId: "c1", firstName: "س", familyName: "ص", identityNumber: "12345678901", password: PW }, 400, "رقم الهوية يجب أن يتكوّن من 9 أرقام.");
  });
  it("A3 duplicate identity → 409 with the existing message naming the student and class, nothing written", async () => {
    const { r } = await rejected(ctxOf(), { action: "create", classId: "c1", firstName: "س", familyName: "ص", identityNumber: "100000001", password: PW }, 409, "رقم الهوية مستخدم مسبقًا للطالب أحمد علي في الصف صف 1");
    expect(r.jsonBody.error).toContain("أحمد علي");
  });
  it("A4 short password → 400", async () => {
    await rejected(ctxOf(), { action: "create", classId: "c1", firstName: "س", familyName: "ص", identityNumber: "100000009", password: "abc" }, 400, "كلمة المرور يجب أن تحتوي على 6 محارف على الأقل.");
  });
  it("A5 archived / unknown class keeps its established 400", async () => {
    await rejected(ctxOf(), { action: "create", classId: "cArch", firstName: "س", familyName: "ص", identityNumber: "100000009", password: PW }, 400, "الصف غير موجود أو مؤرشف.", { noStore: false });
    await rejected(ctxOf(), { action: "create", classId: "nope", firstName: "س", familyName: "ص", identityNumber: "100000009", password: PW }, 400, "الصف غير موجود أو مؤرشف.", { noStore: false });
  });
  it("A6 a valid create still succeeds (200) and writes user + auth", async () => {
    const ctx = ctxOf();
    const r = await run(ctx, { action: "create", classId: "c1", firstName: "س", familyName: "ص", identityNumber: "100000009", password: PW });
    expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true); expect(r.jsonBody.student.identityNumber).toBe("100000009");
    expect(ctx.has("platform/auth/" + studentCodeHash("100000009") + ".json")).toBe(true);
  });
  it("A7 the typed error is a real Error carrying httpStatus and the optional code", () => {
    const e = new StudentActionError(409, "x", "duplicate");
    expect(e).toBeInstanceOf(Error); expect(e.httpStatus).toBe(409); expect(e.code).toBe("duplicate"); expect(e.message).toBe("x"); expect(e.name).toBe("StudentActionError");
    expect(new StudentActionError(400, "y").code).toBeUndefined();
  });
});

describe("B. single actions — state preconditions and missing resources", () => {
  it("B1 toggleActive on an archived student → 409, document unchanged", async () => {
    await rejected(ctxOf(), { action: "toggleActive", userId: "s2" }, 409, "استعد الطالب من الأرشيف أولًا.");
  });
  it("B2 unarchive into an archived class → 400, student stays archived", async () => {
    const ctx = ctxOf();
    await rejected(ctx, { action: "unarchive", userId: "s3" }, 400, "فعّل الصف قبل استعادة الطالب.");
    expect(ctx.getJson("platform/users/s3.json").archived).toBe(true);
  });
  it("B3 resetPassword with a short password → 400 before the lock, authVersion untouched", async () => {
    const ctx = ctxOf();                                   // no lease stub on purpose: the check precedes the lock
    await rejected(ctx, { action: "resetPassword", userId: "s1", password: "abc" }, 400, "كلمة المرور يجب أن تحتوي على 6 محارف على الأقل.");
    expect(ctx.getJson("platform/users/s1.json").authVersion).toBe(1);
  });
  it("B4 resetPassword when the auth document is missing → 404 with the existing message", async () => {
    await rejected(withLease(ctxOf()), { action: "resetPassword", userId: "s4", password: PW }, 404, "ملف دخول الطالب غير موجود.", { unchanged: false });
  });
  it("B5 stale reset (a newer credential version already exists) → 409", async () => {
    const ctx = withLease(ctxOf());
    const authName = "platform/auth/" + studentCodeHash("100000001") + ".json";
    ctx.setJson(authName, { ...ctx.getJson(authName), authVersion: 7 });   // newer than the version this reset will own
    await rejected(ctx, { action: "resetPassword", userId: "s1", password: PW }, 409, "تم تغيير كلمة المرور من عملية أحدث. أعد المحاولة.", { unchanged: false });
    expect(ctx.getJson(authName).passwordHash).toBe("y");                 // credential NOT overwritten
  });
  it("B6 missing student → 404 for every single action (handler pre-check unchanged)", async () => {
    for (const action of ["toggleActive", "archive", "unarchive", "delete", "resetPassword"]) {
      const r = await run(ctxOf(), { action, userId: "ghost", password: PW });
      expect(r.status).toBe(404); expect(r.jsonBody).toEqual({ ok: false, error: "الطالب غير موجود." });
    }
  });
  it("B7 the happy paths are untouched: toggle an active student, archive, unarchive into an active class", async () => {
    const ctx = ctxOf();
    expect((await run(ctx, { action: "toggleActive", userId: "s1" })).status).toBe(200);
    expect((await run(ctx, { action: "archive", userId: "s1" })).jsonBody).toMatchObject({ ok: true, archived: true, rosterSynced: true });
    expect((await run(ctx, { action: "unarchive", userId: "s1" })).jsonBody).toMatchObject({ ok: true, archived: false, active: true, rosterSynced: true });
  });
});

describe("C. infrastructure failures keep their semantics", () => {
  it("C1 a genuine storage failure (non-404) → 500 generic message, logError used, logWarn not", async () => {
    const ctx = ctxOf(); const obs = obsSpy();
    const orig = ctx.container.getBlobClient.bind(ctx.container);
    ctx.container.getBlobClient = name => { const cl = orig(name); if (name === "platform/users/s2.json") cl.download = async () => { const e = new Error("storage down"); e.statusCode = 503; throw e; }; return cl; };
    const r = await run(ctx, { action: "toggleActive", userId: "s2" }, obs);
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: GENERIC_500 });
    expect(obs.logError).toHaveBeenCalledTimes(1); expect(obs.logError.mock.calls[0][0]).toBe("student.manage.error");
    expect(obs.logWarn).not.toHaveBeenCalled();
  });
  it("C2 an unknown exception (not a StudentActionError) still maps to the generic 500", async () => {
    const ctx = ctxOf(); const obs = obsSpy();
    const r = await handler(post({ action: "archive", userId: "s1" }), { ...deps(ctx), requireBuilderAuth: () => { throw new TypeError("unexpected"); } }, obs);
    expect(r.status).toBe(500); expect(r.jsonBody.error).toBe(GENERIC_500); expect(obs.logError).toHaveBeenCalledTimes(1);
  });
  it("C3 persistent credential-lock contention → 409 with the lock message (unchanged)", async () => {
    const ctx = ctxOf(); const obs = obsSpy();
    const orig = ctx.container.getBlobClient.bind(ctx.container);
    ctx.container.getBlobClient = name => { const cl = orig(name); cl.getBlobLeaseClient = () => ({ acquireLease: async () => { const e = new Error("leased"); e.statusCode = 409; throw e; }, releaseLease: async () => {} }); return cl; };
    const r = await run(ctx, { action: "resetPassword", userId: "s1", password: PW }, obs);
    expect(r.status).toBe(409); expect(r.jsonBody).toEqual({ ok: false, error: "عملية أخرى على بيانات الطالب قيد التنفيذ. أعد المحاولة." });
    expect(obs.logWarn.mock.calls[0][0]).toBe("student.credential.lock_contention"); expect(obs.logError).not.toHaveBeenCalled();
  }, 20000);
});

describe("D. bulk paths are unchanged (row-level messages, duplicate classification, outer 200)", () => {
  it("D1 bulkImport: duplicate + invalid rows are reported per row, valid row imported, outer request 200", async () => {
    const ctx = ctxOf();
    const r = await run(ctx, { action: "bulkImport", classId: "c1", students: [
      { firstName: "س", familyName: "ص", identityNumber: "100000001" },           // duplicate of s1
      { firstName: "", familyName: "", identityNumber: "100000010" },             // missing name
      { firstName: "ك", familyName: "ل", identityNumber: "100000011" }            // valid
    ] });
    expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true);
    expect(r.jsonBody.imported).toBe(1); expect(r.jsonBody.failed).toBe(2); expect(r.jsonBody.duplicates).toBe(1);
    const dup = r.jsonBody.errors.find(e => e.identityNumber === "100000001"), bad = r.jsonBody.errors.find(e => e.identityNumber === "100000010");
    expect(dup.duplicate).toBe(true); expect(dup.error).toContain("رقم الهوية مستخدم مسبقًا للطالب أحمد علي");
    expect(bad.duplicate).toBe(false); expect(bad.error).toBe("يجب إدخال الاسم الشخصي واسم العائلة.");
    expect(r.jsonBody.credentials).toHaveLength(1);
  });
  it("D2 bulkAction: rejected rows stay per-row errors with the same messages; the batch still returns 200", async () => {
    const ctx = ctxOf();
    const r = await run(ctx, { action: "bulkAction", operation: "unarchive", userIds: ["s3", "s2", "ghost"] });
    expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true);
    expect(r.jsonBody.processed).toBe(1); expect(r.jsonBody.failed).toBe(2);   // s2 (class c1 active) restored; s3 + ghost rejected
    expect(r.jsonBody.errors).toEqual(expect.arrayContaining([{ userId: "s3", error: "فعّل الصف قبل استعادة الطالب." }, { userId: "ghost", error: "الطالب غير موجود." }]));
    expect(ctx.getJson("platform/users/s2.json").archived).toBe(false); expect(ctx.getJson("platform/users/s3.json").archived).toBe(true);
    const r2 = await run(ctx, { action: "bulkAction", operation: "activate", userIds: ["s3"] });
    expect(r2.status).toBe(200); expect(r2.jsonBody.errors).toEqual([{ userId: "s3", error: "استعد الطالب من الأرشيف أولًا." }]);
  });
});

describe("E. privacy and observability", () => {
  const dump = obs => JSON.stringify([obs.logInfo.mock.calls, obs.logWarn.mock.calls, obs.logError.mock.calls]);
  it("E1 typed rejections log ONE warning with safe metadata only — never the message, never a password", async () => {
    const { r, obs } = await rejected(ctxOf(), { action: "create", classId: "c1", firstName: "س", familyName: "ص", identityNumber: "100000001", password: PW }, 409, "رقم الهوية مستخدم مسبقًا للطالب أحمد علي في الصف صف 1");
    expect(obs.logWarn).toHaveBeenCalledTimes(1); expect(obs.logError).not.toHaveBeenCalled();
    expect(obs.logWarn.mock.calls[0]).toEqual(["student.manage.rejected", { action: "create", httpStatus: 409, errorCode: "duplicate" }]);
    const logs = dump(obs);
    expect(logs).not.toContain(PW); expect(logs).not.toContain("أحمد"); expect(logs).not.toContain("رقم الهوية");
    expect(JSON.stringify(r)).not.toContain(PW);
  });
  it("E2 validation rejections use errorCode 'validation' and carry the action name", async () => {
    const { obs } = await rejected(ctxOf(), { action: "toggleActive", userId: "s2" }, 409, "استعد الطالب من الأرشيف أولًا.");
    expect(obs.logWarn.mock.calls[0]).toEqual(["student.manage.rejected", { action: "toggleactive", httpStatus: 409, errorCode: "validation" }]);
  });
  it("E3 the plaintext password never appears in body or logs on ANY rejected reset/create path", async () => {
    for (const [ctx, body] of [
      [ctxOf(), { action: "create", classId: "c1", firstName: "", familyName: "", identityNumber: "100000009", password: PW }],
      [withLease(ctxOf()), { action: "resetPassword", userId: "s4", password: PW }],
      [ctxOf(), { action: "create", classId: "cArch", firstName: "س", familyName: "ص", identityNumber: "100000009", password: PW }]
    ]) {
      const obs = obsSpy(); const r = await run(ctx, body, obs);
      expect(r.status).toBeGreaterThanOrEqual(400); expect(JSON.stringify(r)).not.toContain(PW); expect(dump(obs)).not.toContain(PW);
    }
  });
  it("E4 a storage failure's logError never carries the request body or a password either", async () => {
    const ctx = ctxOf(); const obs = obsSpy();
    const orig = ctx.container.getBlobClient.bind(ctx.container);
    ctx.container.getBlobClient = name => { const cl = orig(name); if (name === "platform/users/s1.json") cl.download = async () => { const e = new Error("down"); e.statusCode = 503; throw e; }; return cl; };
    const r = await run(ctx, { action: "resetPassword", userId: "s1", password: PW }, obs);
    expect(r.status).toBe(500); expect(dump(obs)).not.toContain(PW); expect(JSON.stringify(r)).not.toContain(PW);
  });
});

describe("F. source / architecture guards", () => {
  const src = readFileSync(path.join(HERE, "..", "src", "functions", "manage-students.js"), "utf8");
  it("F1 the generic 500 branch and its logError remain, after the typed branch", () => {
    const typed = src.indexOf("e instanceof StudentActionError"), generic = src.indexOf('obs?.logError("student.manage.error", e)');
    expect(typed).toBeGreaterThan(0); expect(generic).toBeGreaterThan(typed);
    expect(src).toContain('error: "' + GENERIC_500 + '"');
  });
  it("F2 the CredentialLockBusyError branch is intact and still 409", () => {
    expect(src).toMatch(/if \(e instanceof CredentialLockBusyError\) \{\s*obs\?\.logWarn\("student\.credential\.lock_contention"/);
  });
  it("F3 the typed warning never logs the message, and bulk loops still catch per row", () => {
    const warn = src.match(/obs\?\.logWarn\("student\.manage\.rejected", \{([^}]*)\}\)/);
    expect(warn).not.toBeNull(); expect(warn[1]).not.toMatch(/message|e\.message/);
    expect((src.match(/error: error instanceof Error \? error\.message : "تعذر (إنشاء الطالب|تنفيذ العملية)\."/g) || []).length).toBe(2);
  });
  it("F4 no frontend change is needed: the teacher client already surfaces the server's error text", () => {
    const ui = readFileSync(path.join(HERE, "..", "..", "src", "TeacherPlatform.tsx"), "utf8");
    expect(ui).toContain('if(!response.ok)throw new Error(result.error||"حدث خطأ.")');
  });
});
