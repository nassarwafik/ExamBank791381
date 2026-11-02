import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import sharp from "sharp";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P4-C — the school identity, server side (TEST data only):
//   the owner creates / renames schools, publishes a logo through the SAME safe image pipeline as photos (real bytes sniffed —
//   never SVG —, decoded, re-encoded to WebP, fitted inside, never cropped), links teachers; every POST needs step-up + audit;
//   a teacher's sign-in answer and session probe carry their school ONLY when they have one (no school = the same answer as
//   before); a student sees the school of the teacher who owns them (student → class → LEGACY_DATA_OWNER → the imported t_legacy
//   for unowned data); GET /api/school-logo serves only the CALLER's own school, with headers that can never make it a document.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p4c-school-identity-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.OWNER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: ownerSchools } = await import("../src/functions/owner-schools.js");
const { handler: ownerTeachers } = await import("../src/functions/owner-teachers.js");
const { handler: schoolLogo } = await import("../src/functions/school-logo.js");
const { handler: platformSession } = await import("../src/functions/platform-session.js");
const { handler: login } = await import("../src/functions/platform-login.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName, usernameReservationName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { createStudentToken, hashPassword, studentCodeHash, normalizeStudentCode } = await import("../src/lib/student-auth.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");
const { hashSecret } = await import("../src/lib/identity/password-hash.js");
const { schoolDocName, LOGO_PREFIX, SCHOOL_PREFIX } = await import("../src/lib/schools.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const OWNER_ID = "own_0011223344556677";
const SARA = "t_00112233445566aa";
const OMAR = "t_00112233445566bb";
const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };
const PASSWORD = "a long teacher passphrase";
const png = (w, h) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 10, g: 80, b: 160, alpha: 0.5 } } }).png().toBuffer();
const dataUrl = (buf, mime = "image/png") => "data:" + mime + ";base64," + buf.toString("base64");

function req({ method = "POST", action = "", body = {}, headers = {}, query = null } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: { action }, ...(query ? { query: new URLSearchParams(query) } : {}), headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}

async function setup() {
  resetOperatorGateCache();
  const mem = createMemoryContainer();
  const now = Date.now();
  const deps = { getContainer: () => mem.container, hashParams: FAST, reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "10.0.0.9" };
  const credential = await hashSecret(PASSWORD, { params: FAST });
  for (const [id, username] of [[SARA, "t.sara"], [OMAR, "t.omar"]]) {
    mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: username, status: "active", credential, authVersion: 1, revokedSessions: [] });
    mem.setJson(usernameReservationName(username), { schemaVersion: 1, accountId: id, role: "teacher", username });
  }
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const headers = {};
  for (const [name, ago] of [["owner", 0], ["ownerStale", 11 * 60 * 1000]]) {
    const sid = (ago ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - ago });
    headers[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  // classes and students: c1 owned by Sara; c0 unowned (pre-tenancy); s1 in c1, s0 in c0, s2 owned directly by Omar
  mem.setJson("platform/classes/c1.json", { classId: "c1", name: "صف سارة", ownerId: SARA });
  mem.setJson("platform/classes/c0.json", { classId: "c0", name: "صف قديم" });
  for (const [id, classId, extra] of [["s1", "c1", {}], ["s0", "c0", {}], ["s2", "c1", { ownerId: OMAR }]]) {
    mem.setJson("platform/users/" + id + ".json", { userId: id, role: "student", code: "100" + id, displayName: "طالب " + id, classId, active: true, authVersion: 1, ...extra });
  }
  const teacherToken = id => createManagedTeacherToken({ accountId: id, sid: newTeacherSessionId(), authVersion: 1 }).token;
  const studentToken = id => createStudentToken({ userId: id, authVersion: 1, code: "100" + id, displayName: "x", classId: "c1" });
  return { mem, deps, ...headers, teacherToken, studentToken };
}
const school = (ctx, action, body, headers = ctx.owner) => ownerSchools(req({ action, headers, body }), ctx.deps);
const list = ctx => ownerSchools(req({ method: "GET", headers: ctx.owner }), ctx.deps);
const audits = ctx => ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
const probeTeacher = (ctx, id) => platformSession(req({ method: "GET", headers: { "x-builder-token": ctx.teacherToken(id) } }), ctx.deps);
const probeStudent = (ctx, id) => platformSession(req({ method: "GET", headers: { "x-student-token": ctx.studentToken(id) } }), ctx.deps);
const logoAs = (ctx, headers) => schoolLogo(req({ method: "GET", headers }), ctx.deps);

async function schoolWithLogo(ctx, name = "مدرسة النور") {
  const c = await school(ctx, "create", { name });
  const id = c.jsonBody.school.schoolId;
  const l = await school(ctx, "logo", { schoolId: id, dataUrl: dataUrl(await png(800, 200)) });
  expect(l.status).toBe(200);
  return id;
}

describe("P4-C owner school management", () => {
  let ctx;
  beforeEach(async () => { ctx = await setup(); });

  it("owner only; every change needs a recent step-up", async () => {
    expect((await ownerSchools(req({ method: "GET" }), ctx.deps)).status).toBe(401);
    expect((await ownerSchools(req({ method: "GET", headers: { "x-builder-token": ctx.teacherToken(SARA) } }), ctx.deps)).status).toBe(401);
    const r = await school(ctx, "create", { name: "مدرسة" }, ctx.ownerStale);
    expect([r.status, r.jsonBody.code]).toEqual([403, "STEP_UP_REQUIRED"]);
    expect(ctx.mem.names(SCHOOL_PREFIX)).toEqual([]);
  });

  it("create (name trimmed, required), rename, list with teacher counts; audited", async () => {
    expect((await school(ctx, "create", { name: "   " })).jsonBody.code).toBe("SCHOOL_NAME_INVALID");
    const c = await school(ctx, "create", { name: "  مدرسة   النور  " });
    expect(c.status).toBe(201);
    const id = c.jsonBody.school.schoolId;
    expect(id).toMatch(/^sch_[a-f0-9]{16}$/);
    expect(c.jsonBody.school).toEqual({ schoolId: id, name: "مدرسة النور", logo: null, teachers: 0 });
    expect((await school(ctx, "rename", { schoolId: id, name: "مدرسة النور الثانوية" })).jsonBody.school.name).toBe("مدرسة النور الثانوية");
    await school(ctx, "link", { accountId: SARA, schoolId: id });
    expect((await list(ctx)).jsonBody.schools).toEqual([{ schoolId: id, name: "مدرسة النور الثانوية", logo: null, teachers: 1 }]);
    expect(audits(ctx).map(e => e.action).sort()).toEqual(["owner.school.created", "owner.school.linked", "owner.school.renamed"]);
    expect(audits(ctx).find(e => e.action === "owner.school.linked").details).toEqual({ from: null, to: id });
  });

  it("the logo: the real bytes decide (an SVG / a renamed file is refused), re-encoded to WebP, fitted inside (never cropped)", async () => {
    const id = (await school(ctx, "create", { name: "مدرسة" })).jsonBody.school.schoolId;
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    for (const bad of [dataUrl(svg, "image/svg+xml"), dataUrl(svg, "image/png"), dataUrl(Buffer.from("not an image at all"), "image/jpeg")]) {
      const r = await school(ctx, "logo", { schoolId: id, dataUrl: bad });
      expect(r.status).toBe(400);
      expect(r.jsonBody.code).toMatch(/^LOGO_(UNSUPPORTED|UNDECODABLE)$/);
    }
    expect(ctx.mem.names(LOGO_PREFIX)).toEqual([]);
    const r = await school(ctx, "logo", { schoolId: id, dataUrl: dataUrl(await png(800, 200)) });
    expect(r.status).toBe(200);
    expect(r.jsonBody.school.logo).toMatchObject({ version: 1 });
    const blob = ctx.mem.names(LOGO_PREFIX);
    expect(blob).toHaveLength(1);
    const stored = ctx.mem.getBinary(blob[0]);
    expect(stored.contentType).toBe("image/webp");
    const meta = await sharp(stored.buffer).metadata();
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(["webp", 512, 128, true]);   // 4:1 kept, alpha kept
    expect(JSON.stringify(ctx.mem.getJson(schoolDocName(id)))).not.toContain("<svg");
    expect(JSON.stringify((await list(ctx)).jsonBody)).not.toContain("blobKey");
  });

  it("replace then remove: one immutable blob at a time; the owner's preview follows", async () => {
    const id = await schoolWithLogo(ctx);
    await school(ctx, "logo", { schoolId: id, dataUrl: dataUrl(await png(300, 300)) });
    expect(ctx.mem.names(LOGO_PREFIX)).toHaveLength(1);
    const preview = await ownerSchools(req({ method: "GET", action: "logo", headers: ctx.owner, query: { schoolId: id } }), ctx.deps);
    expect([preview.status, preview.headers["content-type"], preview.headers["X-Content-Type-Options"]]).toEqual([200, "image/webp", "nosniff"]);
    const removed = await school(ctx, "remove-logo", { schoolId: id });
    expect(removed.jsonBody.school.logo).toBeNull();
    expect(ctx.mem.names(LOGO_PREFIX)).toEqual([]);
    expect((await ownerSchools(req({ method: "GET", action: "logo", headers: ctx.owner, query: { schoolId: id } }), ctx.deps)).status).toBe(404);
    expect(audits(ctx).map(e => e.action)).toEqual(expect.arrayContaining(["owner.school.logo-updated", "owner.school.logo-removed"]));
  });

  it("link: a valid teacher and an existing school (or null); unlink; the owner view shows the link", async () => {
    const id = (await school(ctx, "create", { name: "مدرسة" })).jsonBody.school.schoolId;
    expect((await school(ctx, "link", { accountId: "../x", schoolId: id })).status).toBe(400);
    expect((await school(ctx, "link", { accountId: "t_99887766554433aa", schoolId: id })).status).toBe(404);
    expect((await school(ctx, "link", { accountId: SARA, schoolId: "sch_0000000000000000" })).jsonBody.code).toBe("SCHOOL_NOT_FOUND");
    expect((await school(ctx, "link", { accountId: SARA, schoolId: "../x" })).jsonBody.code).toBe("SCHOOL_ID_INVALID");
    expect(ctx.mem.getJson(teacherAccountName(SARA)).schoolId).toBeUndefined();
    await school(ctx, "link", { accountId: SARA, schoolId: id });
    const teachers = async () => (await ownerTeachers(req({ method: "GET", headers: ctx.owner }), ctx.deps)).jsonBody.teachers;
    expect((await teachers()).find(t => t.accountId === SARA).schoolId).toBe(id);
    expect((await teachers()).find(t => t.accountId === OMAR).schoolId).toBeNull();
    await school(ctx, "link", { accountId: SARA, schoolId: null });
    expect(ctx.mem.getJson(teacherAccountName(SARA)).schoolId).toBeNull();
  });

  it("unknown school / malformed ids are refused before anything is read or written", async () => {
    for (const action of ["rename", "logo", "remove-logo"]) {
      expect((await school(ctx, action, { schoolId: "sch_0000000000000000", name: "x", dataUrl: "data:image/png;base64,AA==" })).status).toBe(404);
      expect((await school(ctx, action, { schoolId: "../../platform/accounts/x" })).jsonBody.code).toBe("SCHOOL_ID_INVALID");
    }
  });
});

describe("P4-C the teacher sees their school", () => {
  let ctx;
  beforeEach(async () => { ctx = await setup(); });

  it("no school: the sign-in answer and the probe are exactly as before (no `school` field)", async () => {
    const p = await probeTeacher(ctx, SARA);
    expect(p.status).toBe(200);
    expect(Object.keys(p.jsonBody).sort()).toEqual(["access", "displayName", "expiresAt", "ok", "role"]);
    const l = await login(req({ body: { userCode: "t.sara", password: PASSWORD } }), ctx.deps);
    expect(l.status).toBe(200);
    expect("school" in l.jsonBody).toBe(false);
  });

  it("linked: name + logo version in both answers (never a blob key)", async () => {
    const id = await schoolWithLogo(ctx);
    await school(ctx, "link", { accountId: SARA, schoolId: id });
    const p = await probeTeacher(ctx, SARA);
    expect(p.jsonBody.school).toEqual({ schoolId: id, name: "مدرسة النور", logo: { version: 1, updatedAt: expect.any(String) } });
    const l = await login(req({ body: { userCode: "t.sara", password: PASSWORD } }), ctx.deps);
    expect(l.jsonBody.school).toEqual(p.jsonBody.school);
    expect(JSON.stringify(l.jsonBody)).not.toContain("blobKey");
    expect("school" in (await probeTeacher(ctx, OMAR)).jsonBody).toBe(false);      // another teacher of no school
  });

  it("a link to a school that no longer validates, or a storage failure, shows nothing and never fails the sign-in", async () => {
    const id = await schoolWithLogo(ctx);
    await school(ctx, "link", { accountId: SARA, schoolId: id });
    ctx.mem.setJson(schoolDocName(id), { schemaVersion: 1, schoolId: "sch_ffffffffffffffff", name: "x" });
    const p = await probeTeacher(ctx, SARA);
    expect([p.status, "school" in p.jsonBody]).toEqual([200, false]);
  });

  it("an identity that predates the console (the shared password) has no school", async () => {
    const p = await platformSession(req({ method: "GET", headers: { "x-builder-token": createBuilderToken("teacher") } }), ctx.deps);
    expect("school" in p.jsonBody).toBe(false);
  });
});

describe("P4-C the student sees their teacher's school (owner decision §19.8)", () => {
  let ctx;
  beforeEach(async () => { ctx = await setup(); });

  it("through the class's teacher; the student's own owner wins; nothing when the teacher has no school", async () => {
    const nour = await schoolWithLogo(ctx, "مدرسة النور");
    const amal = (await school(ctx, "create", { name: "مدرسة الأمل" })).jsonBody.school.schoolId;
    expect("school" in (await probeStudent(ctx, "s1")).jsonBody).toBe(false);
    await school(ctx, "link", { accountId: SARA, schoolId: nour });
    await school(ctx, "link", { accountId: OMAR, schoolId: amal });
    expect((await probeStudent(ctx, "s1")).jsonBody.school).toMatchObject({ schoolId: nour, name: "مدرسة النور", logo: { version: 1 } });
    expect((await probeStudent(ctx, "s2")).jsonBody.school).toEqual({ schoolId: amal, name: "مدرسة الأمل", logo: null });
  });

  it("unowned (pre-tenancy) data → the imported workspace's school when that account exists; otherwise nothing", async () => {
    const id = await schoolWithLogo(ctx);
    expect("school" in (await probeStudent(ctx, "s0")).jsonBody).toBe(false);
    ctx.mem.setJson(teacherAccountName("t_legacy"), { schemaVersion: 1, accountId: "t_legacy", role: "teacher", username: "w.old", displayName: "قديم", status: "active", credential: {}, authVersion: 1, revokedSessions: [], origin: "shared-password-workspace", schoolId: id });
    expect((await probeStudent(ctx, "s0")).jsonBody.school).toMatchObject({ schoolId: id });
  });

  it("the student sign-in answer carries it too", async () => {
    const id = await schoolWithLogo(ctx);
    await school(ctx, "link", { accountId: SARA, schoolId: id });
    const code = normalizeStudentCode("100s1");
    ctx.mem.setJson("platform/auth/" + studentCodeHash(code) + ".json", { userId: "s1", active: true, authVersion: 1, ...hashPassword("student-pass-1") });
    const r = await login(req({ body: { userCode: "100s1", password: "student-pass-1" } }), ctx.deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ role: "student", school: { schoolId: id, name: "مدرسة النور", logo: { version: 1 } } });
  });
});

describe("P4-C GET /api/school-logo serves only the caller's own school", () => {
  let ctx;
  beforeEach(async () => { ctx = await setup(); });

  it("anonymous 401; a teacher / student without a school (or a logo) 404", async () => {
    expect((await logoAs(ctx, {})).status).toBe(401);
    expect((await logoAs(ctx, { "x-builder-token": ctx.teacherToken(SARA) })).status).toBe(404);
    expect((await logoAs(ctx, { "x-student-token": ctx.studentToken("s1") })).status).toBe(404);
    const id = (await school(ctx, "create", { name: "بلا شعار" })).jsonBody.school.schoolId;
    await school(ctx, "link", { accountId: SARA, schoolId: id });
    expect((await logoAs(ctx, { "x-builder-token": ctx.teacherToken(SARA) })).status).toBe(404);
  });

  it("the teacher and their students get the logo, with headers that can never make it a document; another school's teacher does not", async () => {
    const id = await schoolWithLogo(ctx);
    await school(ctx, "link", { accountId: SARA, schoolId: id });
    for (const headers of [{ "x-builder-token": ctx.teacherToken(SARA) }, { "x-student-token": ctx.studentToken("s1") }, { authorization: "Bearer " + ctx.studentToken("s1") }]) {
      const r = await logoAs(ctx, headers);
      expect(r.status).toBe(200);
      expect(r.headers).toMatchObject({ "content-type": "image/webp", "cache-control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin" });
      expect((await sharp(r.body).metadata()).format).toBe("webp");
    }
    expect((await logoAs(ctx, { "x-builder-token": ctx.teacherToken(OMAR) })).status).toBe(404);
    expect((await logoAs(ctx, { "x-student-token": ctx.studentToken("s2") })).status).toBe(404);   // Omar's student
  });

  it("a revoked teacher session or an archived student is refused", async () => {
    const id = await schoolWithLogo(ctx);
    await school(ctx, "link", { accountId: SARA, schoolId: id });
    ctx.mem.setJson(teacherAccountName(SARA), { ...ctx.mem.getJson(teacherAccountName(SARA)), status: "suspended" });
    expect((await logoAs(ctx, { "x-builder-token": ctx.teacherToken(SARA) })).status).toBe(401);
    ctx.mem.setJson("platform/users/s1.json", { ...ctx.mem.getJson("platform/users/s1.json"), archived: true });
    expect((await logoAs(ctx, { "x-student-token": ctx.studentToken("s1") })).status).toBe(401);
  });
});
