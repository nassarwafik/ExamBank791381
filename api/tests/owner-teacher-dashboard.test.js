import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";
import { school, NOW } from "./fixtures/analytics-school.js";

// Owner Console «لوحة البيانات» — phase 1: GET /api/owner-teacher-dashboard (owner session, read only). A new owner route (a
// feature: no fail-first). TEST data only. What it must prove:
//   · only the owner: no token, a teacher token and a student token are refused; a malformed / unknown account is 400 / 404;
//   · the figures are EXACTLY the teacher's own «لوحة المتابعة» (same function, same scope), never another teacher's data;
//   · a class or student of another teacher is refused like the teacher's own route refuses it;
//   · every view is recorded in the owner's audit log (account + scope only, no student data); a view that cannot be recorded is
//     refused and serves no figure (fail closed).

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "owner-teacher-dashboard-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: dashboard, teacherScope } = await import("../src/functions/owner-teacher-dashboard.js");
const { handler: teacherAnalytics } = await import("../src/functions/teacher-analytics.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { createStudentToken } = await import("../src/lib/student-auth.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb", LEGACY = "t_legacy";
const OWNER = "own_0011223344556677";
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });

function setup() {
  resetRevisionCache(); resetOperatorGateCache();
  const seed = school();
  seed["platform/classes/c1.json"].ownerId = SARA;
  seed["platform/classes/c3.json"].ownerId = SARA;
  seed["platform/classes/c2.json"].ownerId = OMAR;                      // c2, its students s11/s12 and assignment P3 are Omar's
  const mem = createMemoryContainer(seed);
  for (const [id, name, user] of [[SARA, "سارة", "t.sara"], [OMAR, "عمر", "t.omar"], [LEGACY, "المساحة القديمة", "legacy"]]) {
    mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username: user, displayName: name, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] });
  }
  const now = Date.now();
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER), { schemaVersion: 1, accountId: OWNER, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const sid = "c".repeat(32);
  // no recent step-up: the dashboard is read only and does not ask for one (owner decision)
  mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - 60 * 60e3 });
  const owner = { "x-owner-token": createOwnerToken({ accountId: OWNER, sid, authVersion: 1 }, { nowMs: now }).token };
  const deps = { getContainer: () => mem.container, container: mem.container, docCache: null };
  return { mem, deps, owner };
}
const view = (ctx, h, query) => dashboard({ method: "GET", url: "https://x/api/owner-teacher-dashboard?" + query, headers: hdr(h) }, ctx.deps);
const ownerLog = ctx => ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).filter(e => e.action === "owner.teacher.dashboard.viewed");
const teacherOwn = async (ctx, accountId, query = "") => {
  const token = recordedManagedToken(ctx.mem, { accountId, sid: newTeacherSessionId(), authVersion: 1 }).token;
  return teacherAnalytics({ method: "GET", url: "https://x/api/teacher-analytics" + (query ? "?" + query : ""), headers: hdr({ "x-builder-token": token }) }, ctx.deps);
};
// `generatedAt` is the time each answer was computed (milliseconds apart); everything else must be identical
const strip = (body, key) => { const { [key]: _drop, generatedAt: _at, ...rest } = body; return rest; };

describe("owner teacher dashboard — who may read it", () => {
  it("refuses a request without an owner session, with a teacher token and with a student token; records nothing", async () => {
    const ctx = setup();
    expect((await view(ctx, {}, "accountId=" + SARA)).status).toBe(401);
    const teacher = recordedManagedToken(ctx.mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token;
    expect((await view(ctx, { "x-builder-token": teacher, authorization: "Bearer " + teacher }, "accountId=" + SARA)).status).toBe(401);
    const student = createStudentToken({ userId: "s01", authVersion: 1, code: "1000000001", displayName: "ط", classId: "c1" });
    expect((await view(ctx, { "x-student-token": student, authorization: "Bearer " + student }, "accountId=" + SARA)).status).toBe(401);
    expect(ownerLog(ctx)).toEqual([]);
  });
  it("a malformed account id is 400 and an unknown account 404, without reading figures or recording", async () => {
    const ctx = setup();
    for (const bad of ["", "../x", "t_XYZ", "own_0011223344556677"]) expect((await view(ctx, ctx.owner, "accountId=" + encodeURIComponent(bad))).status).toBe(400);
    const r = await view(ctx, ctx.owner, "accountId=t_00000000000000ff");
    expect([r.status, r.jsonBody.code]).toEqual([404, "TEACHER_NOT_FOUND"]);
    expect(ownerLog(ctx)).toEqual([]);
  });
  it("no step-up is asked (read only)", async () => {
    const ctx = setup();
    expect((await view(ctx, ctx.owner, "accountId=" + SARA)).status).toBe(200);
  });
});

describe("owner teacher dashboard — the teacher's own figures, never another teacher's", () => {
  it("equals the teacher's own «لوحة المتابعة» (same function, same scope) plus the teacher's identity", async () => {
    const ctx = setup();
    const own = await teacherOwn(ctx, SARA);
    expect(own.status).toBe(200);
    const r = await view(ctx, ctx.owner, "accountId=" + SARA);
    expect(r.status).toBe(200);
    expect(r.jsonBody.teacher).toEqual({ accountId: SARA, username: "t.sara", displayName: "سارة", status: "active" });
    expect(strip(r.jsonBody, "teacher")).toEqual(strip(own.jsonBody, "widgets"));
  });
  it("the same for a class scope, a student scope and a date range", async () => {
    const ctx = setup();
    for (const q of ["classId=c1", "classId=c1&studentId=s01", "from=2026-02-01T00:00:00.000Z&to=2026-04-01T00:00:00.000Z"]) {
      const own = await teacherOwn(ctx, SARA, q);
      const r = await view(ctx, ctx.owner, "accountId=" + SARA + "&" + q);
      expect([q, r.status]).toEqual([q, own.status]);
      expect(strip(r.jsonBody, "teacher")).toEqual(strip(own.jsonBody, "widgets"));
    }
  });
  it("Sara's dashboard holds none of Omar's classes, students or assignments — and Omar's none of Sara's", async () => {
    const ctx = setup();
    const sara = (await view(ctx, ctx.owner, "accountId=" + SARA)).jsonBody;
    expect(sara.classes.map(c => c.classId).sort()).toEqual(["c1", "c3"]);
    const saraText = JSON.stringify(sara);
    for (const foreign of ["s11", "s12", "صف 2", "واجب P3"]) expect(saraText.includes(foreign)).toBe(false);
    const omar = (await view(ctx, ctx.owner, "accountId=" + OMAR)).jsonBody;
    expect(omar.classes.map(c => c.classId)).toEqual(["c2"]);
    const omarText = JSON.stringify(omar);
    for (const foreign of ["s01", "s02", "صف 1", "واجب P1"]) expect(omarText.includes(foreign)).toBe(false);
  });
  it("a class or student of another teacher is refused exactly like the teacher's own route refuses it", async () => {
    const ctx = setup();
    for (const q of ["classId=c2", "classId=c2&studentId=s11", "classId=c1&studentId=s11"]) {
      const own = await teacherOwn(ctx, SARA, q);
      const r = await view(ctx, ctx.owner, "accountId=" + SARA + "&" + q);
      expect([q, r.status]).toEqual([q, own.status]);
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.jsonBody.ok).toBe(false);
      expect(JSON.stringify(r.jsonBody).includes("s12")).toBe(false);
    }
  });
  it("the legacy workspace account gets the scope its own session has (unowned data stays outside unless assigned)", async () => {
    const ctx = setup();
    const own = await teacherOwn(ctx, LEGACY);
    const r = await view(ctx, ctx.owner, "accountId=" + LEGACY);
    expect(r.status).toBe(own.status);
    expect(strip(r.jsonBody, "teacher")).toEqual(strip(own.jsonBody, "widgets"));
  });
  it("the scope is always a teacher tenant — never an unscoped (whole-platform) read", () => {
    expect(teacherScope(SARA)).toBe(SARA);
    expect(teacherScope(LEGACY)).toBe(LEGACY);
  });
});

describe("owner teacher dashboard — recorded, without student data", () => {
  it("every view is recorded once with the account and the scope only", async () => {
    const ctx = setup();
    await view(ctx, ctx.owner, "accountId=" + SARA);
    await view(ctx, ctx.owner, "accountId=" + SARA + "&classId=c1&studentId=s01");
    const log = ownerLog(ctx);
    expect(log).toHaveLength(2);
    expect(log.map(e => [e.actor, e.targetId, e.targetLabel, e.details.scope]).sort()).toEqual([
      ["owner:" + OWNER, SARA, "t.sara", "global"], ["owner:" + OWNER, SARA, "t.sara", "student"]
    ]);
    const text = JSON.stringify(log);
    for (const studentData of ["s01", "طالب", "percentage", "average"]) expect(text.includes(studentData)).toBe(false);
  });
  it("a view that cannot be recorded is refused and serves no figure (fail closed)", async () => {
    const ctx = setup();
    const r = await dashboard({ method: "GET", url: "https://x/api/owner-teacher-dashboard?accountId=" + SARA, headers: hdr(ctx.owner) },
      { ...ctx.deps, recordOwnerAuditEvent: async () => { throw new Error("audit store down"); } });
    expect(r.status).toBe(503);
    expect(r.jsonBody).toEqual({ ok: false, code: "OWNER_DASHBOARD_UNAVAILABLE", error: expect.any(String) });
  });
  it("a storage failure while computing is a 503, never partial figures", async () => {
    const ctx = setup();
    const r = await dashboard({ method: "GET", url: "https://x/api/owner-teacher-dashboard?accountId=" + SARA, headers: hdr(ctx.owner) },
      { ...ctx.deps, computeTeacherAnalytics: async () => { throw new Error("blob read failed"); } });
    expect([r.status, r.jsonBody.ok, "kpis" in r.jsonBody]).toEqual([503, false, false]);
    expect(ownerLog(ctx)).toEqual([]);
  });
});
void NOW;
