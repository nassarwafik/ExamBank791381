import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P2-B — «استيراد مساحتي القديمة»: the owner creates, ONCE, the managed account of the shared-password workspace (owner
// decisions D6 / D7, approved design 2026-11-01). TEST data only.
//   - only from the Owner Console, with a recent step-up, written to the owner audit log;
//   - a fixed account id (t_legacy) — never a personal identity number, never the old sign-in code — and an invitation link;
//   - that account sees the pre-tenancy (unowned) data exactly as the shared-password sign-in did; a console-created teacher still
//     does not (hotfix #504); what it creates afterwards is its own;
//   - no data document is read, moved or changed by the import;
//   - refused when it does not apply (BUILDER_USERS mode, LEGACY_DATA_OWNER set) and the second time (create-only, even racing);
//   - the account is then an ordinary managed account (suspend / reset / end sessions take effect on the next request).

process.env.BANK_SETUP_KEY = "p2b-import-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: ownerTeachers } = await import("../src/functions/owner-teachers.js");
const { handler: invitation } = await import("../src/functions/teacher-invitation.js");
const { handler: login } = await import("../src/functions/platform-login.js");
const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { handler: platformSession } = await import("../src/functions/platform-session.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { LEGACY_TEACHER_ACCOUNT_ID, isTeacherAccountId, ACCOUNT_ID_RE } = await import("../src/lib/identity/teacher-token.js");
const { CONSOLE_ACCOUNT_RE, canAccessDocument } = await import("../src/lib/teacher-tenancy.js");
const { resetOperatorGateCache } = await import("../src/lib/identity/operator-gate.js");
const { profileDocName } = await import("../src/lib/teacher-profile.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };
const OWNER_ID = "own_0011223344556677";
const PASSWORD = "a long teacher passphrase";
const OLD_CLASS = { classId: "c-old", name: "صف قديم", status: "active", studentIds: ["u-old"] };

function req({ method = "POST", action = "", body = {}, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: { action }, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}
const teacherHeaders = token => ({ "x-builder-token": token });
const tokenOf = invitationPath => invitationPath.replace(/^#\/invite\//, "");

function setup(envOverrides = {}) {
  resetOperatorGateCache();
  const mem = createMemoryContainer({ "platform/classes/c-old.json": OLD_CLASS });
  const env = { ...process.env, ...envOverrides };
  const deps = { getContainer: () => mem.container, env, hashParams: FAST, reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "10.0.0.7" };
  const now = Date.now();
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const ownerHeaders = stepUpAgoMs => {
    const sid = (stepUpAgoMs > 60_000 ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - stepUpAgoMs });
    return { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  };
  return { mem, deps, owner: ownerHeaders(0), ownerStale: ownerHeaders(11 * 60 * 1000) };
}

const importLegacy = (ctx, body = { username: "w.nassar", displayName: "الأستاذ وفيق" }, headers = ctx.owner) =>
  ownerTeachers(req({ action: "import-legacy", headers, body }), ctx.deps);
async function importAndActivate(ctx) {
  const r = await importLegacy(ctx);
  expect(r.status).toBe(201);
  const a = await invitation(req({ action: "accept", body: { token: tokenOf(r.jsonBody.invitation.invitationPath), password: PASSWORD } }), ctx.deps);
  expect(a.status).toBe(200);
  const s = await login(req({ body: { userCode: "w.nassar", password: PASSWORD } }), ctx.deps);
  expect(s.status).toBe(200);
  return s.jsonBody.token;
}
const classIds = async (ctx, token) => {
  const r = await classrooms(req({ method: "GET", headers: teacherHeaders(token) }), ctx.deps);
  expect(r.status).toBe(200);
  return r.jsonBody.classes.map(c => c.classId).sort();
};

describe("P2-B the reserved account id", () => {
  it("t_legacy is a managed account id but not a console id; the console never issues it; look-alikes are refused", () => {
    expect(LEGACY_TEACHER_ACCOUNT_ID).toBe("t_legacy");
    expect(isTeacherAccountId("t_legacy")).toBe(true);
    expect(isTeacherAccountId("t_00112233445566aa")).toBe(true);
    for (const id of ["t_legacy ", "t_legacyx", "T_LEGACY", "legacy", "t_0011", "builder"]) expect(isTeacherAccountId(id), id).toBe(false);
    expect(ACCOUNT_ID_RE.test("t_legacy")).toBe(false);
    expect(CONSOLE_ACCOUNT_RE.test("t_legacy")).toBe(false);
    // It keeps the shared-password workspace's view of unowned data; a console teacher does not get it.
    expect(canAccessDocument(OLD_CLASS, "t_legacy", {})).toBe(true);
    expect(canAccessDocument(OLD_CLASS, "t_00112233445566aa", {})).toBe(false);
  });
});

describe("P2-B import of the shared-password workspace", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("the owner's teacher list says the import is available (shared-password mode, nothing imported yet)", async () => {
    const r = await ownerTeachers(req({ method: "GET", headers: ctx.owner }), ctx.deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody.legacyImport).toEqual({ available: true });
  });

  it("needs an owner session with a recent step-up; a teacher token is refused", async () => {
    expect((await importLegacy(ctx, undefined, {})).status).toBe(401);
    const stale = await importLegacy(ctx, undefined, ctx.ownerStale);
    expect(stale.status).toBe(403);
    expect(stale.jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect(ctx.mem.has(teacherAccountName(LEGACY_TEACHER_ACCOUNT_ID))).toBe(false);
  });

  it("creates the account t_legacy (origin recorded, invited, a one-time link), audited; no data document is touched", async () => {
    const before = new Map(ctx.mem.names("platform/classes/").map(n => [n, ctx.mem.store.get(n).etag]));
    const r = await importLegacy(ctx);
    expect(r.status).toBe(201);
    expect(r.jsonBody.teacher).toMatchObject({ accountId: "t_legacy", username: "w.nassar", displayName: "الأستاذ وفيق", status: "invited", hasPassword: false, origin: "shared-password-workspace" });
    expect(tokenOf(r.jsonBody.invitation.invitationPath)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ctx.mem.getJson(teacherAccountName("t_legacy"))).toMatchObject({ origin: "shared-password-workspace", createdBy: "owner:" + OWNER_ID });
    for (const [n, etag] of before) expect(ctx.mem.store.get(n).etag, n).toBe(etag);
    const events = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
    expect(events.map(e => e.action)).toContain("owner.teacher.legacy-imported");
    const list = await ownerTeachers(req({ method: "GET", headers: ctx.owner }), ctx.deps);
    expect(list.jsonBody.legacyImport).toEqual({ available: false, reason: "ALREADY_IMPORTED", accountId: "t_legacy" });
  });

  it("only once: a second import is refused, also when two run at the same time", async () => {
    const [a, b] = await Promise.all([importLegacy(ctx), importLegacy(ctx, { username: "w.other", displayName: "آخر" })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a, b].find(r => r.status === 409).jsonBody.code).toBe("LEGACY_IMPORT_ALREADY_IMPORTED");
    const again = await importLegacy(ctx, { username: "w.third", displayName: "ثالث" });
    expect(again.status).toBe(409);
    expect(again.jsonBody.code).toBe("LEGACY_IMPORT_ALREADY_IMPORTED");
    expect(ctx.mem.names("platform/accounts/teachers/")).toEqual([teacherAccountName("t_legacy")]);
  });

  it("validates like a new teacher: a taken / invalid username or a missing display name is refused and nothing is created", async () => {
    for (const [body, code] of [[{ username: "12345678", displayName: "x" }, "USERNAME_INVALID"], [{ username: "w.ok", displayName: "" }, "DISPLAY_NAME_INVALID"]]) {
      const r = await importLegacy(ctx, body);
      expect(r.status).toBe(400);
      expect(r.jsonBody.code).toBe(code);
    }
    expect(ctx.mem.has(teacherAccountName("t_legacy"))).toBe(false);
  });

  it("end to end: invitation → own password → sign-in by username → the old classes, exactly as before; new classes are its own", async () => {
    const token = await importAndActivate(ctx);
    expect(await classIds(ctx, token)).toEqual(["c-old"]);
    const probe = await platformSession(req({ method: "GET", headers: teacherHeaders(token) }), ctx.deps);
    expect(probe.status).toBe(200);
    expect(probe.jsonBody.displayName).toBe("الأستاذ وفيق");
    // A teacher created from the console still starts empty (hotfix #504) and never sees the imported workspace.
    const c = await ownerTeachers(req({ action: "create", headers: ctx.owner, body: { username: "t.sara", displayName: "سارة" } }), ctx.deps);
    await invitation(req({ action: "accept", body: { token: tokenOf(c.jsonBody.invitation.invitationPath), password: PASSWORD } }), ctx.deps);
    const sara = (await login(req({ body: { userCode: "t.sara", password: PASSWORD } }), ctx.deps)).jsonBody.token;
    expect(await classIds(ctx, sara)).toEqual([]);
    // Ownership after the import: a new class of the imported account is stamped with its id and invisible to the other teacher.
    ctx.mem.setJson("platform/classes/c-new.json", { classId: "c-new", name: "صف جديد", status: "active", studentIds: [], ownerId: "t_legacy" });
    expect(await classIds(ctx, token)).toEqual(["c-new", "c-old"]);
    expect(await classIds(ctx, sara)).toEqual([]);
  });

  it("the imported account is an ordinary managed account: suspension takes effect on the next request", async () => {
    const token = await importAndActivate(ctx);
    const s = await ownerTeachers(req({ action: "suspend", headers: ctx.owner, body: { accountId: "t_legacy" } }), ctx.deps);
    expect(s.status).toBe(200);
    expect((await classrooms(req({ method: "GET", headers: teacherHeaders(token) }), ctx.deps)).status).toBe(401);
    expect((await login(req({ body: { userCode: "w.nassar", password: PASSWORD } }), ctx.deps)).status).toBe(401);
  });

  it("the shared password still does not sign in after the import (D6); the new username does", async () => {
    await importAndActivate(ctx);
    const shared = await login(req({ body: { userCode: "w.nassar", password: process.env.BUILDER_PASSWORD } }), ctx.deps);
    expect(shared.status).toBe(401);
    expect(shared.jsonBody.token).toBeUndefined();
  });
});

describe("P2-B import — when it does not apply", () => {
  it("BUILDER_USERS mode: not available and refused (those teachers already have their own identities)", async () => {
    const ctx = setup({ BUILDER_USERS: JSON.stringify({ users: { "teacher-a": { passwordEnv: "PW_A", displayName: "A" } } }), PW_A: "pw-a" });
    expect((await ownerTeachers(req({ method: "GET", headers: ctx.owner }), ctx.deps)).jsonBody.legacyImport).toEqual({ available: false, reason: "NOT_SHARED_PASSWORD_MODE" });
    const r = await importLegacy(ctx);
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("LEGACY_IMPORT_NOT_SHARED_PASSWORD_MODE");
    expect(ctx.mem.has(teacherAccountName("t_legacy"))).toBe(false);
  });

  it("LEGACY_DATA_OWNER set: refused (the unowned data already names another owner; the account would see none of it)", async () => {
    const ctx = setup({ LEGACY_DATA_OWNER: "teacher-x" });
    expect((await ownerTeachers(req({ method: "GET", headers: ctx.owner }), ctx.deps)).jsonBody.legacyImport).toEqual({ available: false, reason: "LEGACY_DATA_OWNER_SET" });
    const r = await importLegacy(ctx);
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("LEGACY_IMPORT_LEGACY_DATA_OWNER_SET");
    expect(JSON.stringify(r.jsonBody)).not.toContain("teacher-x");
  });

  it("the console's other actions accept t_legacy only as an existing account; create never issues it", async () => {
    const ctx = setup();
    const missing = await ownerTeachers(req({ action: "suspend", headers: ctx.owner, body: { accountId: "t_legacy" } }), ctx.deps);
    expect(missing.status).toBe(404);
    const c = await ownerTeachers(req({ action: "create", headers: ctx.owner, body: { username: "t.sara", displayName: "سارة", accountId: "t_legacy" } }), ctx.deps);
    expect(c.status).toBe(201);
    expect(c.jsonBody.teacher.accountId).toMatch(ACCOUNT_ID_RE);
    expect(c.jsonBody.teacher.origin).toBe("console");
  });
});

describe("P2-B import — the old profile (name / preset avatar) follows when the old identity is known", () => {
  it("BUILDER_USER_CODE set and a profile saved under it → copied once to the new account", async () => {
    const ctx = setup({ BUILDER_USER_CODE: "old-code" });
    ctx.mem.setJson(profileDocName("old-code"), { schemaVersion: 1, teacherId: "old-code", displayName: "أ. وفيق", avatarId: "a3", updatedAt: "2026-01-01T00:00:00Z" });
    expect((await importLegacy(ctx)).status).toBe(201);
    expect(ctx.mem.getJson(profileDocName("t_legacy"))).toMatchObject({ teacherId: "t_legacy", displayName: "أ. وفيق", avatarId: "a3" });
    expect(ctx.mem.getJson(profileDocName("old-code")).displayName).toBe("أ. وفيق");     // the old document is left as it was
    const events = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
    expect(events.find(e => e.action === "owner.teacher.legacy-imported").details).toEqual({ profileCopied: true });
  });

  it("BUILDER_USER_CODE absent (the old code was free text) → nothing is guessed; the owner's display name is used", async () => {
    const ctx = setup();
    ctx.mem.setJson(profileDocName("builder"), { schemaVersion: 1, teacherId: "builder", displayName: "اسم آخر", avatarId: "a5" });
    expect((await importLegacy(ctx)).status).toBe(201);
    expect(ctx.mem.has(profileDocName("t_legacy"))).toBe(false);
  });
});
