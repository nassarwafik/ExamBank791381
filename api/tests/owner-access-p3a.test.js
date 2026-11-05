import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P3-A — the owner assigns teacher capabilities (/api/owner-access) and a teacher's session probe reports them. TEST data.
//   owner session + recent step-up · validation codes (never corrected) · immutable revision then compare-and-set of the account
//   pointer · a stale screen or a concurrent change → 409 · audit · the change is seen on the teacher's NEXT request · in P3-A no
//   behaviour changes (mode legacy; enforce cannot be chosen yet).

process.env.BANK_SETUP_KEY = "p3a-owner-access-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: ownerAccess } = await import("../src/functions/owner-access.js");
const { handler: ownerTeachers } = await import("../src/functions/owner-teachers.js");
const { handler: platformSession } = await import("../src/functions/platform-session.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");
const { resetOperatorGateCache } = await import("../src/lib/identity/operator-gate.js");
const { revisionName, resetRevisionCache, REVISION_PREFIX } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { preset } = await import("../src/lib/access/presets.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");

const OWNER_ID = "own_0011223344556677";
const SARA = "t_00112233445566aa";

function req({ method = "POST", action = "", body = {}, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: { action }, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}

function setup({ owner = true } = {}) {
  resetOperatorGateCache();
  resetRevisionCache();
  const mem = createMemoryContainer();
  const now = Date.now();
  const deps = { getContainer: () => mem.container };
  mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] });
  const headers = {};
  if (owner) {
    mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
    mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
    for (const [name, ago] of [["owner", 0], ["ownerStale", 11 * 60 * 1000]]) {
      const sid = (ago ? "d" : "c").repeat(32);
      mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - ago });
      headers[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
    }
  }
  const saraToken = recordedManagedToken(mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token;
  return { mem, deps, ...headers, saraToken };
}
const assign = (ctx, body, headers = ctx.owner) => ownerAccess(req({ action: "assign", headers, body: { accountId: SARA, presetId: "learning-only", presetVersion: 1, ...body } }), ctx.deps);
const probe = (ctx, token) => platformSession(req({ method: "GET", headers: { "x-builder-token": token } }), ctx.deps);

describe("P3-A owner access API", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("GET needs an owner session and returns the mode (legacy), the registry and the presets; a teacher token is refused", async () => {
    expect((await ownerAccess(req({ method: "GET" }), ctx.deps)).status).toBe(401);
    expect((await ownerAccess(req({ method: "GET", headers: { "x-builder-token": ctx.saraToken } }), ctx.deps)).status).toBe(401);
    const r = await ownerAccess(req({ method: "GET", headers: ctx.owner }), ctx.deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody.mode).toBe("legacy");
    expect(r.jsonBody.capabilities.find(c => c.id === "platform.operations.run")).toMatchObject({ ownerOnly: true });
    // Tadris+ P5-B4 added full-teaching v2 (the teacher may also create / manage classes); v1 stays published, marked superseded
    expect(r.jsonBody.presets.map(p => p.id + "@" + p.version + (p.current ? "" : " (superseded)"))).toEqual(["legacy-full@1", "full-teaching@1 (superseded)", "full-teaching@2", "learning-ready-assignments@1", "learning-only@1"]);
  });

  it("assign needs a recent step-up", async () => {
    const r = await assign(ctx, {}, ctx.ownerStale);
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect(ctx.mem.names(REVISION_PREFIX)).toEqual([]);
  });

  it("assign: an immutable revision, then the account pointer; audited; the owner's list shows it", async () => {
    const r = await assign(ctx, { grants: ["messages.inbox.read"], reason: "تجربة" });
    expect(r.status).toBe(200);
    const id = r.jsonBody.access.revisionId;
    expect(r.jsonBody.access).toMatchObject({ preset: { id: "learning-only", version: 1 }, grants: 1, denies: 0 });
    expect(r.jsonBody.capabilities).toContain("messages.inbox.read");
    expect(ctx.mem.getJson(revisionName(id))).toMatchObject({ accountId: SARA, parentRevisionId: null, preset: { id: "learning-only", version: 1 }, grants: ["messages.inbox.read"], reason: "تجربة", createdBy: "owner:" + OWNER_ID });
    expect(ctx.mem.getJson(teacherAccountName(SARA))).toMatchObject({ accessRevisionId: id, accessPreset: { id: "learning-only", version: 1 } });
    const events = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
    expect(events.find(e => e.action === "owner.access.assigned")).toMatchObject({ targetId: SARA, details: { revisionId: id, grants: ["messages.inbox.read"] } });
    const list = await ownerTeachers(req({ method: "GET", headers: ctx.owner }), ctx.deps);
    expect(list.jsonBody.teachers[0].access).toEqual({ revisionId: id, preset: { id: "learning-only", version: 1 }, grants: 1, denies: 0 });
    // A second change chains to the first (linear history).
    const second = await assign(ctx, { presetId: "full-teaching", baseRevisionId: id });
    expect(second.status).toBe(200);
    expect(ctx.mem.getJson(revisionName(second.jsonBody.access.revisionId)).parentRevisionId).toBe(id);
  });

  it.each([
    [{ presetId: "admin" }, "PRESET_UNKNOWN"],
    [{ grants: ["platform.teachers.manage"] }, "PLATFORM_CAPABILITY_FORBIDDEN"],
    [{ grants: ["examBuilder.exam.fly"] }, "CAPABILITY_UNKNOWN"],
    [{ grants: ["messages.inbox.read"], denies: ["messages.inbox.read"] }, "CAPABILITY_CONFLICT"],
    [{ denies: ["learning.course.assign"] }, "DEPENDENCY_UNMET"],
    [{ grants: "everything" }, "REVISION_MALFORMED"]
  ])("refused, nothing written: %j → %s", async (body, code) => {
    const r = await assign(ctx, body);
    expect(r.status).toBe(400);
    expect(r.jsonBody.code).toBe(code);
    expect(ctx.mem.names(REVISION_PREFIX)).toEqual([]);
    expect(ctx.mem.getJson(teacherAccountName(SARA)).accessRevisionId).toBeUndefined();
  });

  it("an invalid or unknown account is refused", async () => {
    expect((await assign(ctx, { accountId: "../x" })).status).toBe(400);
    expect((await assign(ctx, { accountId: "t_99887766554433aa" })).status).toBe(404);
  });

  it("a stale screen (baseRevisionId) and two concurrent changes from the same state: one wins, the other is 409", async () => {
    const first = await assign(ctx, {});
    const stale = await assign(ctx, { presetId: "full-teaching", baseRevisionId: null });
    expect(stale.status).toBe(409);
    expect(stale.jsonBody.code).toBe("ACCESS_CONFLICT");
    const base = first.jsonBody.access.revisionId;
    const [a, b] = await Promise.all([assign(ctx, { presetId: "full-teaching", baseRevisionId: base }), assign(ctx, { presetId: "learning-ready-assignments", baseRevisionId: base })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = [a, b].find(r => r.status === 200).jsonBody.access.revisionId;
    expect(ctx.mem.getJson(teacherAccountName(SARA)).accessRevisionId).toBe(winner);
  });

  it("mode: observe can be chosen (audited); enforce only when ready (P3-B2 — here a teacher has no access); nothing else", async () => {
    const r = await ownerAccess(req({ action: "mode", headers: ctx.owner, body: { mode: "observe" } }), ctx.deps);
    expect(r.status).toBe(200);
    expect(ctx.mem.getJson(ACCESS_CONTROL_DOC)).toMatchObject({ schemaVersion: 1, mode: "observe", updatedBy: "owner:" + OWNER_ID });
    expect(ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).find(e => e.action === "owner.access.mode").details).toEqual({ from: "legacy", to: "observe" });
    // Tadris+ P3-B2 — enforce became choosable behind the readiness gate: «سارة» has no access, so it is refused as not ready.
    const notReady = await ownerAccess(req({ action: "mode", headers: ctx.owner, body: { mode: "enforce" } }), ctx.deps);
    expect(notReady.status).toBe(409);
    expect(notReady.jsonBody.code).toBe("ACCESS_NOT_READY");
    for (const mode of ["", "admin"]) {
      const x = await ownerAccess(req({ action: "mode", headers: ctx.owner, body: { mode } }), ctx.deps);
      expect(x.status).toBe(409);
      expect(x.jsonBody.code).toBe("ACCESS_MODE_NOT_SETTABLE");
    }
    expect(ctx.mem.getJson(ACCESS_CONTROL_DOC).mode).toBe("observe");
  });
});

describe("P3-A the teacher's session probe reports the effective capabilities", () => {
  it("a console account without access: none (default deny); after the owner assigns, the NEXT probe shows them", async () => {
    const ctx = setup();
    const before = await probe(ctx, ctx.saraToken);
    expect(before.status).toBe(200);
    expect(before.jsonBody.access).toEqual({ status: "ok", source: "unassigned", preset: null, capabilities: [], enforced: false, games: ["number-conversion", "live-challenge"] });   // P7-B2: + games (not enforced: every game)
    await assign(ctx, {});
    const after = await probe(ctx, ctx.saraToken);
    expect(after.jsonBody.access).toEqual({ status: "ok", source: "revision", preset: { id: "learning-only", version: 1 }, capabilities: [...preset("learning-only", 1).capabilities].sort(), enforced: false, games: ["number-conversion", "live-challenge"] });   // P3-C: + enforced; P7-B2: + games
  });
  it("a shared-password session (no owner yet) → legacy-full", async () => {
    const ctx = setup({ owner: false });
    const r = await probe(ctx, createBuilderToken("teacher"));
    expect(r.status).toBe(200);
    expect(r.jsonBody.access).toMatchObject({ status: "ok", source: "shared-password", preset: { id: "legacy-full", version: 1 } });
  });
  it("a revision that cannot be trusted: the session stays valid, access is «unavailable» with no capabilities", async () => {
    const ctx = setup();
    const a = ctx.mem.getJson(teacherAccountName(SARA));
    ctx.mem.setJson(teacherAccountName(SARA), { ...a, accessRevisionId: "ar_000000009_ffffffffffffffff", accessPreset: { id: "full-teaching", version: 1 } });
    const r = await probe(ctx, ctx.saraToken);
    expect(r.status).toBe(200);
    expect(r.jsonBody.access).toEqual({ status: "unavailable", capabilities: [] });
  });
});
