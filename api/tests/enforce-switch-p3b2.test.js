import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P3-B2 — the owner turns enforcement on (TEST data only):
//   only with a recent step-up · only while every active or invited teacher has access (readiness), else 409 naming them and
//   nothing written · leaving enforcement is always allowed · audited · a teacher created while enforcing MUST get a preset (it is
//   written before the account, so the account never exists without access) · end to end: the teacher's next request obeys it.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p3b2-enforce-root-secret";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: ownerAccess } = await import("../src/functions/owner-access.js");
const { handler: ownerTeachers } = await import("../src/functions/owner-teachers.js");
const { handler: invitation } = await import("../src/functions/teacher-invitation.js");
const { handler: login } = await import("../src/functions/platform-login.js");
const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { handler: aiAuthor } = await import("../src/functions/ai-question-author.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { REVISION_PREFIX, revisionName } = await import("../src/lib/access/revisions.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };
const OWNER_ID = "own_0011223344556677";
const PASSWORD = "a long teacher passphrase";

function req({ method = "POST", action = "", body = {}, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, url: "https://x.invalid/api/x", params: { action }, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}
const H = token => ({ "x-builder-token": token, authorization: "Bearer " + token });

function setup() {
  resetOperatorGateCache(); resetRevisionCache();
  const mem = createMemoryContainer();
  const now = Date.now();
  const deps = { getContainer: () => mem.container, hashParams: FAST, reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "10.0.0.5" };
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const headers = {};
  for (const [name, ago] of [["owner", 0], ["ownerStale", 11 * 60 * 1000]]) {
    const sid = (ago ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - ago });
    headers[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  return { mem, deps, ...headers };
}
const setMode = (ctx, mode, headers = ctx.owner) => ownerAccess(req({ action: "mode", headers, body: { mode } }), ctx.deps);
const create = (ctx, body) => ownerTeachers(req({ action: "create", headers: ctx.owner, body: { displayName: "معلم", ...body } }), ctx.deps);
const assign = (ctx, accountId, presetId = "full-teaching") => ownerAccess(req({ action: "assign", headers: ctx.owner, body: { accountId, presetId, presetVersion: 1 } }), ctx.deps);
const tokenOf = p => p.replace(/^#\/invite\//, "");
async function activate(ctx, created, username) {
  expect((await invitation(req({ action: "accept", body: { token: tokenOf(created.jsonBody.invitation.invitationPath), password: PASSWORD } }), ctx.deps)).status).toBe(200);
  const s = await login(req({ body: { userCode: username, password: PASSWORD } }), ctx.deps);
  expect(s.status).toBe(200);
  return s.jsonBody.token;
}

describe("P3-B2 turning enforcement on", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("needs a recent step-up", async () => {
    const r = await setMode(ctx, "enforce", ctx.ownerStale);
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect(ctx.mem.has(ACCESS_CONTROL_DOC)).toBe(false);
  });

  it("refused while an active or invited teacher has no access — naming them, nothing written; allowed once everyone has access", async () => {
    const sara = await create(ctx, { username: "t.sara", displayName: "سارة" });
    const omar = await create(ctx, { username: "t.omar", displayName: "عمر", presetId: "learning-only", presetVersion: 1 });
    expect(sara.status).toBe(201); expect(omar.status).toBe(201);
    const refused = await setMode(ctx, "enforce");
    expect(refused.status).toBe(409);
    expect(refused.jsonBody.code).toBe("ACCESS_NOT_READY");
    expect(refused.jsonBody.missing).toEqual([{ accountId: sara.jsonBody.teacher.accountId, displayName: "سارة" }]);
    expect(ctx.mem.has(ACCESS_CONTROL_DOC)).toBe(false);
    expect((await assign(ctx, sara.jsonBody.teacher.accountId)).status).toBe(200);
    const on = await setMode(ctx, "enforce");
    expect(on.status).toBe(200);
    expect(ctx.mem.getJson(ACCESS_CONTROL_DOC)).toMatchObject({ schemaVersion: 1, mode: "enforce", updatedBy: "owner:" + OWNER_ID });
    const ev = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).filter(e => e.action === "owner.access.mode");
    expect(ev.at(-1).details).toEqual({ from: "legacy", to: "enforce" });
  });

  it("a suspended teacher and the imported workspace (D7 default) do not block readiness", async () => {
    const sara = await create(ctx, { username: "t.sara", displayName: "سارة" });
    expect((await ownerTeachers(req({ action: "suspend", headers: ctx.owner, body: { accountId: sara.jsonBody.teacher.accountId } }), ctx.deps)).status).toBe(200);
    ctx.mem.setJson(teacherAccountName("t_legacy"), { schemaVersion: 1, accountId: "t_legacy", role: "teacher", username: "w.nassar", displayName: "وفيق", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], origin: "shared-password-workspace" });
    expect((await setMode(ctx, "enforce")).status).toBe(200);
  });

  it("leaving enforcement is always allowed, even when not ready", async () => {
    ctx.mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "enforce" });
    await create(ctx, { username: "t.sara", presetId: "learning-only", presetVersion: 1 });
    ctx.mem.setJson(teacherAccountName("t_00112233445566aa"), { schemaVersion: 1, accountId: "t_00112233445566aa", role: "teacher", username: "t.x", displayName: "x", status: "active", credential: null, authVersion: 1, revokedSessions: [] });
    for (const mode of ["observe", "legacy"]) {
      const r = await setMode(ctx, mode);
      expect(r.status).toBe(200);
      expect(ctx.mem.getJson(ACCESS_CONTROL_DOC).mode).toBe(mode);
    }
  });
});

describe("P3-B2 creating a teacher with access", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("with a preset: the revision is written first and the account points at it from birth; audited", async () => {
    const r = await create(ctx, { username: "t.sara", presetId: "learning-only", presetVersion: 1 });
    expect(r.status).toBe(201);
    const id = r.jsonBody.teacher.accountId;
    const account = ctx.mem.getJson(teacherAccountName(id));
    expect(account.accessPreset).toEqual({ id: "learning-only", version: 1 });
    expect(ctx.mem.getJson(revisionName(account.accessRevisionId))).toMatchObject({ accountId: id, parentRevisionId: null, preset: { id: "learning-only", version: 1 } });
    expect(r.jsonBody.teacher.access).toMatchObject({ preset: { id: "learning-only", version: 1 } });
    const ev = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).find(e => e.action === "owner.teacher.created");
    expect(ev.details).toMatchObject({ revisionId: account.accessRevisionId, preset: { id: "learning-only", version: 1 } });
  });

  it("an unknown preset is refused and nothing is written", async () => {
    const r = await create(ctx, { username: "t.sara", presetId: "admin", presetVersion: 1 });
    expect(r.status).toBe(400);
    expect(r.jsonBody.code).toBe("PRESET_UNKNOWN");
    expect(ctx.mem.names("platform/accounts/teachers/")).toEqual([]);
    expect(ctx.mem.names(REVISION_PREFIX)).toEqual([]);
  });

  it("without a preset: allowed outside enforcement (the teacher starts without access, as before)", async () => {
    const r = await create(ctx, { username: "t.sara" });
    expect(r.status).toBe(201);
    expect(r.jsonBody.teacher.access).toBeNull();
  });

  it("while enforcing — or when the mode cannot be read — a preset is REQUIRED; nothing is written without one", async () => {
    for (const doc of [{ schemaVersion: 1, mode: "enforce" }, { schemaVersion: 1, mode: "garbled" }]) {
      ctx.mem.setJson(ACCESS_CONTROL_DOC, doc);
      const r = await create(ctx, { username: "t.sara" });
      expect(r.status).toBe(400);
      expect(r.jsonBody.code).toBe("PRESET_REQUIRED");
      expect(ctx.mem.names("platform/accounts/teachers/")).toEqual([]);
    }
  });
});

describe("P3-B2 end to end", () => {
  it("enforcement on → a learning-only teacher's AI tools are refused, classes allowed; back to observe → allowed on the next request", async () => {
    const ctx = setup();
    const created = await create(ctx, { username: "t.sara", presetId: "learning-only", presetVersion: 1 });
    const token = await activate(ctx, created, "t.sara");
    expect((await setMode(ctx, "enforce")).status).toBe(200);
    const ai = () => aiAuthor(req({ body: { request: "سؤال" }, headers: H(token) }), { ...ctx.deps, callTextJson: async () => { throw new Error("provider not reached"); } });
    const denied = await ai();
    expect(denied.status).toBe(403);
    expect(denied.jsonBody.code).toBe("CAPABILITY_DENIED");
    expect((await classrooms(req({ method: "GET", headers: H(token) }), ctx.deps)).status).toBe(200);
    expect((await setMode(ctx, "observe")).status).toBe(200);
    expect((await ai()).status).not.toBe(403);
  });
});
