import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P4-B2 — the add-teacher wizard's server side (TEST data only): `create` also takes the preset's individual changes
// (`grants` / `denies`, the wizard's «copy from a teacher») and a note for the first revision. They are validated exactly like an
// assignment — refused with their code, never corrected — and a refusal writes NOTHING (no revision, no account, no username
// reservation). Without grants / denies `create` behaves exactly as before.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p4b2-teacher-wizard-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: ownerAccess } = await import("../src/functions/owner-access.js");
const { handler: ownerTeachers } = await import("../src/functions/owner-teachers.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName, usernameReservationName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName, TEACHER_PREFIX } = await import("../src/lib/identity/teacher-accounts.js");
const { revisionName, REVISION_PREFIX } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { preset } = await import("../src/lib/access/presets.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");

const OWNER_ID = "own_0011223344556677";
const OMAR = "t_00112233445566bb";

function req({ method = "POST", action = "", body = {}, headers = {}, query = null } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: { action }, ...(query ? { query: new URLSearchParams(query) } : {}), headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}

function setup() {
  resetOperatorGateCache();
  resetRevisionCache();
  const mem = createMemoryContainer();
  const now = Date.now();
  const deps = { getContainer: () => mem.container };
  mem.setJson(teacherAccountName(OMAR), { schemaVersion: 1, accountId: OMAR, role: "teacher", username: "t.omar", displayName: "عمر", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] });
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const sid = "c".repeat(32);
  mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now });
  return { mem, deps, owner: { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token } };
}
const create = (ctx, body) => ownerTeachers(req({ action: "create", headers: ctx.owner, body: { username: "t.sara", displayName: "سارة", ...body } }), ctx.deps);
const audits = ctx => ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
const nothingWritten = ctx => {
  expect(ctx.mem.names(REVISION_PREFIX)).toEqual([]);
  expect(ctx.mem.names(TEACHER_PREFIX).filter(n => !n.includes(OMAR))).toEqual([]);
  expect(ctx.mem.getJson(usernameReservationName("t.sara"))).toBeFalsy();
};

describe("P4-B2 create with individual changes", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("a preset + grants / denies: the first revision holds them, the account counts them, the audit and the note say so", async () => {
    const r = await create(ctx, { presetId: "learning-only", presetVersion: 1, grants: ["messages.inbox.read"], denies: ["learning.module.release"], accessReason: "نسخ من t.omar" });
    expect(r.status).toBe(201);
    const id = r.jsonBody.teacher.accountId;
    const revId = r.jsonBody.teacher.access.revisionId;
    expect(r.jsonBody.teacher.access).toMatchObject({ preset: { id: "learning-only", version: 1 }, grants: 1, denies: 1 });
    expect(ctx.mem.getJson(revisionName(revId))).toMatchObject({ accountId: id, parentRevisionId: null, grants: ["messages.inbox.read"], denies: ["learning.module.release"], reason: "initial access at creation — نسخ من t.omar" });
    expect(ctx.mem.getJson(teacherAccountName(id))).toMatchObject({ accessRevisionId: revId, accessGrants: 1, accessDenies: 1 });
    expect(audits(ctx).find(e => e.action === "owner.teacher.created").details).toEqual({ revisionId: revId, preset: { id: "learning-only", version: 1 }, grants: ["messages.inbox.read"], denies: ["learning.module.release"] });
    const eff = await ownerAccess(req({ method: "GET", action: "effective", headers: ctx.owner, query: { accountId: id } }), ctx.deps);
    const expected = new Set(preset("learning-only", 1).capabilities); expected.add("messages.inbox.read"); expected.delete("learning.module.release");
    expect(eff.jsonBody.access.capabilities).toEqual([...expected].sort());
  });

  it("a preset only: exactly as before (no lists in the audit, counts 0, the same note)", async () => {
    const r = await create(ctx, { presetId: "learning-only", presetVersion: 1 });
    expect(r.status).toBe(201);
    const revId = r.jsonBody.teacher.access.revisionId;
    expect(ctx.mem.getJson(revisionName(revId))).toMatchObject({ grants: [], denies: [], reason: "initial access at creation" });
    expect(audits(ctx).find(e => e.action === "owner.teacher.created").details).toEqual({ revisionId: revId, preset: { id: "learning-only", version: 1 } });
    expect(ctx.mem.getJson(teacherAccountName(r.jsonBody.teacher.accountId))).toMatchObject({ accessGrants: 0, accessDenies: 0 });
  });

  it("grants / denies without a preset → 400 ACCESS_PRESET_MISSING; nothing written", async () => {
    for (const body of [{ grants: ["messages.inbox.read"] }, { denies: ["messages.inbox.read"] }]) {
      const r = await create(ctx, body);
      expect([r.status, r.jsonBody.code]).toEqual([400, "ACCESS_PRESET_MISSING"]);
    }
    nothingWritten(ctx);
  });

  it("validated like an assignment, refused with its code (never corrected); nothing written", async () => {
    const cases = [
      [{ grants: ["platform.operations.run"] }, "PLATFORM_CAPABILITY_FORBIDDEN"],
      [{ grants: ["no.such.capability"] }, "CAPABILITY_UNKNOWN"],
      [{ grants: ["messages.inbox.read"], denies: ["messages.inbox.read"] }, "CAPABILITY_CONFLICT"],
      [{ grants: ["messages.inbox.read", "messages.inbox.read"] }, "CAPABILITY_DUPLICATE"],
      [{ denies: ["learning.course.assign"] }, "DEPENDENCY_UNMET"],                 // learning.module.release needs it
      [{ grants: "messages.inbox.read" }, "REVISION_MALFORMED"]
    ];
    for (const [lists, code] of cases) {
      const r = await create(ctx, { presetId: "learning-only", presetVersion: 1, ...lists });
      expect({ code, got: [r.status, r.jsonBody.code] }).toEqual({ code, got: [400, code] });
    }
    nothingWritten(ctx);
  });

  it("while enforcing, a copied access satisfies «a preset is required»", async () => {
    ctx.mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "enforce" });
    expect((await create(ctx, {})).jsonBody.code).toBe("PRESET_REQUIRED");
    const r = await create(ctx, { presetId: "learning-only", presetVersion: 1, grants: ["messages.inbox.read"] });
    expect(r.status).toBe(201);
  });

  it("the copy round trip: a teacher created from another's current access gets the same effective capabilities", async () => {
    const a = await ownerAccess(req({ action: "assign", headers: ctx.owner, body: { accountId: OMAR, presetId: "full-teaching", presetVersion: 1, denies: ["messages.direct.send"] } }), ctx.deps);
    expect(a.status).toBe(200);
    const h = await ownerAccess(req({ method: "GET", action: "history", headers: ctx.owner, query: { accountId: OMAR } }), ctx.deps);
    const head = h.jsonBody.entries[0];
    const r = await create(ctx, { presetId: head.preset.id, presetVersion: head.preset.version, grants: head.grants, denies: head.denies, accessReason: "نسخ من t.omar" });
    expect(r.status).toBe(201);
    const eff = await ownerAccess(req({ method: "GET", action: "effective", headers: ctx.owner, query: { accountId: r.jsonBody.teacher.accountId } }), ctx.deps);
    expect(eff.jsonBody.access.capabilities).toEqual(head.capabilities);
  });
});
