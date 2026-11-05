import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P4-B1 — one teacher's page, server side. TEST data only.
//   GET history   — the revision chain from the account's pointer, newest first, re-validated; an untrusted link is shown invalid
//                   and ends the walk (nothing past it is presented as this teacher's history); orphans never appear.
//   GET effective — the resolver's answer for that account (the code every teacher request uses) + whether it is enforced.
//   POST rollback — an earlier revision ON THIS ACCOUNT'S CHAIN restored as a NEW revision (history never rewritten), step-up,
//                   stale screen → 409, audited; the teacher sees it on the next request.
//   suspend       — an optional reason for the owner's record (trimmed, ≤ 200), cleared on reactivation, never sent to the teacher.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p4b1-teacher-details-root-secret";
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
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName, REVISION_PREFIX } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { preset } = await import("../src/lib/access/presets.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");

const OWNER_ID = "own_0011223344556677";
const SARA = "t_00112233445566aa";
const OMAR = "t_00112233445566bb";
const sorted = id => [...preset(id, 1).capabilities].sort();

function req({ method = "POST", action = "", body = {}, headers = {}, query = null, url = "" } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, url, params: { action }, ...(query ? { query: new URLSearchParams(query) } : {}), headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}

function setup() {
  resetOperatorGateCache();
  resetRevisionCache();
  const mem = createMemoryContainer();
  const now = Date.now();
  const deps = { getContainer: () => mem.container };
  for (const [id, username] of [[SARA, "t.sara"], [OMAR, "t.omar"]]) {
    mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: username, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] });
  }
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const headers = {};
  for (const [name, ago] of [["owner", 0], ["ownerStale", 11 * 60 * 1000]]) {
    const sid = (ago ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - ago });
    headers[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  const saraToken = recordedManagedToken(mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token;
  return { mem, deps, ...headers, saraToken };
}
const assign = (ctx, body) => ownerAccess(req({ action: "assign", headers: ctx.owner, body: { accountId: SARA, presetId: "learning-only", presetVersion: 1, ...body } }), ctx.deps);
const history = (ctx, accountId = SARA, headers = ctx.owner) => ownerAccess(req({ method: "GET", action: "history", headers, query: { accountId } }), ctx.deps);
const effective = (ctx, accountId = SARA) => ownerAccess(req({ method: "GET", action: "effective", headers: ctx.owner, query: { accountId } }), ctx.deps);
const rollback = (ctx, body, headers = ctx.owner) => ownerAccess(req({ action: "rollback", headers, body: { accountId: SARA, ...body } }), ctx.deps);
const teacherAct = (ctx, action, body = {}) => ownerTeachers(req({ action, headers: ctx.owner, body: { accountId: SARA, ...body } }), ctx.deps);
const audits = ctx => ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));

/** Two revisions: learning-only (+messages.inbox.read) then full-teaching. → [olderId, currentId] */
async function twoRevisions(ctx) {
  const a = await assign(ctx, { grants: ["messages.inbox.read"], reason: "البداية" });
  const b = await assign(ctx, { presetId: "full-teaching", baseRevisionId: a.jsonBody.access.revisionId });
  expect([a.status, b.status]).toEqual([200, 200]);
  return [a.jsonBody.access.revisionId, b.jsonBody.access.revisionId];
}

describe("P4-B1 GET /api/owner-access/history", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("owner only; invalid id 400; unknown teacher 404; no revision yet → empty", async () => {
    expect((await history(ctx, SARA, {})).status).toBe(401);
    expect((await history(ctx, SARA, { "x-builder-token": ctx.saraToken })).status).toBe(401);
    expect((await history(ctx, "../x")).status).toBe(400);
    expect((await history(ctx, "t_99887766554433aa")).status).toBe(404);
    const r = await history(ctx);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, accountId: SARA, currentRevisionId: null, entries: [], truncated: false });
  });

  it("newest first, each with its content, author, reason and re-computed effective capabilities", async () => {
    const [older, current] = await twoRevisions(ctx);
    const r = await history(ctx);
    expect(r.jsonBody.currentRevisionId).toBe(current);
    expect(r.jsonBody.entries.map(e => e.revisionId)).toEqual([current, older]);
    expect(r.jsonBody.entries[1]).toMatchObject({ parentRevisionId: null, preset: { id: "learning-only", version: 1 }, grants: ["messages.inbox.read"], denies: [], reason: "البداية", createdBy: "owner:" + OWNER_ID, valid: true });
    expect(r.jsonBody.entries[1].capabilities).toEqual([...sorted("learning-only"), "messages.inbox.read"].sort());
    expect(r.jsonBody.entries[0]).toMatchObject({ parentRevisionId: older, valid: true, capabilities: sorted("full-teaching") });
  });

  it("the query can also come from the URL (no request.query)", async () => {
    await twoRevisions(ctx);
    const r = await ownerAccess(req({ method: "GET", action: "history", headers: ctx.owner, url: "https://x.test/api/owner-access/history?accountId=" + SARA }), ctx.deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody.entries).toHaveLength(2);
  });

  it("an untrusted link is shown invalid and ENDS the walk; another account's revision is never presented as hers", async () => {
    const [older, current] = await twoRevisions(ctx);
    // the older revision is tampered: it now claims another account
    ctx.mem.setJson(revisionName(older), { ...ctx.mem.getJson(revisionName(older)), accountId: OMAR });
    let r = await history(ctx);
    expect(r.jsonBody.entries.map(e => [e.revisionId, e.valid, e.code || null])).toEqual([[current, true, null], [older, false, "REVISION_INVALID"]]);
    expect(r.jsonBody.entries[1]).toMatchObject({ preset: null, grants: [], capabilities: [] });
    // a stored revision whose content no longer validates: shown with its code, nothing past it
    ctx.mem.setJson(revisionName(older), { ...ctx.mem.getJson(revisionName(older)), accountId: SARA, preset: { id: "nope", version: 1 }, parentRevisionId: current });
    r = await history(ctx);
    expect(r.jsonBody.entries.map(e => [e.valid, e.code || null])).toEqual([[true, null], [false, "PRESET_UNKNOWN"]]);
    // a missing link
    expect(ctx.mem.store.delete(revisionName(older))).toBe(true);
    r = await history(ctx);
    expect(r.jsonBody.entries.map(e => e.code || null)).toEqual([null, "REVISION_MISSING"]);
  });

  it("a cycle in the chain stops (never loops)", async () => {
    const [older, current] = await twoRevisions(ctx);
    ctx.mem.setJson(revisionName(older), { ...ctx.mem.getJson(revisionName(older)), parentRevisionId: current });
    const r = await history(ctx);
    expect(r.jsonBody.entries.map(e => [e.revisionId, e.valid])).toEqual([[current, true], [older, true], [current, false]]);
  });

  it("an orphan revision (a lost pointer race) is not in the history", async () => {
    const [, current] = await twoRevisions(ctx);
    const { revision } = buildRevision({ accountId: SARA, parentRevisionId: current, presetId: "learning-only", presetVersion: 1, createdBy: "owner:x" });
    ctx.mem.setJson(revisionName(revision.revisionId), revision);
    const r = await history(ctx);
    expect(r.jsonBody.entries.map(e => e.revisionId)).not.toContain(revision.revisionId);
    expect(r.jsonBody.entries).toHaveLength(2);
  });
});

describe("P4-B1 GET /api/owner-access/effective", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("a console account without access: nothing (default deny); not enforced in the legacy mode", async () => {
    const r = await effective(ctx);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, accountId: SARA, accountStatus: "active", mode: "legacy", enforced: false, access: { status: "ok", source: "unassigned", revisionId: null, preset: null, capabilities: [] } });
  });

  it("with a revision: exactly the teacher's capabilities; enforced only in the enforce mode (and when the mode is unreadable)", async () => {
    await assign(ctx, { grants: ["messages.inbox.read"] });
    let r = await effective(ctx);
    expect(r.jsonBody.access).toMatchObject({ status: "ok", source: "revision", preset: { id: "learning-only", version: 1 } });
    expect(r.jsonBody.access.capabilities).toEqual([...sorted("learning-only"), "messages.inbox.read"].sort());
    ctx.mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "enforce" });
    r = await effective(ctx);
    expect(r.jsonBody).toMatchObject({ mode: "enforce", enforced: true });
    ctx.mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "?" });
    r = await effective(ctx);
    expect(r.jsonBody).toMatchObject({ mode: "invalid", enforced: true });
  });

  it("the same answer the teacher's own session gets", async () => {
    await assign(ctx, { presetId: "full-teaching" });
    const r = await effective(ctx);
    const p = await platformSession(req({ method: "GET", headers: { "x-builder-token": ctx.saraToken } }), ctx.deps);
    expect(p.jsonBody.access.capabilities).toEqual(r.jsonBody.access.capabilities);
  });

  it("the imported workspace (t_legacy) without a revision: today's full access", async () => {
    ctx.mem.setJson(teacherAccountName("t_legacy"), { schemaVersion: 1, accountId: "t_legacy", role: "teacher", username: "w.old", displayName: "قديم", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], origin: "shared-password-workspace" });
    const r = await effective(ctx, "t_legacy");
    expect(r.jsonBody.access).toMatchObject({ status: "ok", source: "migrated-default", capabilities: sorted("legacy-full") });
  });

  it("a revision that cannot be trusted → unavailable (fail closed), with its code", async () => {
    const a = await assign(ctx, {});
    resetRevisionCache();
    ctx.mem.setJson(revisionName(a.jsonBody.access.revisionId), { ...ctx.mem.getJson(revisionName(a.jsonBody.access.revisionId)), accountId: OMAR });
    const r = await effective(ctx);
    expect(r.jsonBody.access).toEqual({ status: "unavailable", code: "REVISION_INVALID", revisionId: a.jsonBody.access.revisionId, preset: null, capabilities: [] });
  });
});

describe("P4-B1 POST /api/owner-access/rollback", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("needs a recent step-up", async () => {
    const [older] = await twoRevisions(ctx);
    const r = await rollback(ctx, { revisionId: older }, ctx.ownerStale);
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("STEP_UP_REQUIRED");
  });

  it("restores an older revision as a NEW one (same content, parent = current); audited; the teacher sees it next request", async () => {
    const [older, current] = await twoRevisions(ctx);
    const before = ctx.mem.names(REVISION_PREFIX).length;
    const r = await rollback(ctx, { revisionId: older, baseRevisionId: current, reason: "خطأ في التعديل" });
    expect(r.status).toBe(200);
    const id = r.jsonBody.access.revisionId;
    expect(id).not.toBe(older);
    expect(r.jsonBody).toMatchObject({ restoredFrom: older, access: { preset: { id: "learning-only", version: 1 }, grants: 1, denies: 0 } });
    expect(ctx.mem.names(REVISION_PREFIX)).toHaveLength(before + 1);
    expect(ctx.mem.getJson(revisionName(id))).toMatchObject({ accountId: SARA, parentRevisionId: current, preset: { id: "learning-only", version: 1 }, grants: ["messages.inbox.read"], denies: [], createdBy: "owner:" + OWNER_ID });
    expect(ctx.mem.getJson(revisionName(id)).reason).toBe("استعادة " + older + " — خطأ في التعديل");
    expect(ctx.mem.getJson(revisionName(older)).parentRevisionId).toBe(null);           // history is never rewritten
    expect(ctx.mem.getJson(teacherAccountName(SARA))).toMatchObject({ accessRevisionId: id, accessPreset: { id: "learning-only", version: 1 }, accessGrants: 1, accessDenies: 0 });
    const ev = audits(ctx).find(e => e.action === "owner.access.rolled-back");
    expect(ev).toMatchObject({ targetId: SARA, details: { revisionId: id, restoredFrom: older, parentRevisionId: current, grants: ["messages.inbox.read"] } });
    const p = await platformSession(req({ method: "GET", headers: { "x-builder-token": ctx.saraToken } }), ctx.deps);
    expect(p.jsonBody.access.capabilities).toEqual([...sorted("learning-only"), "messages.inbox.read"].sort());
    expect((await history(ctx)).jsonBody.entries.map(e => e.revisionId)).toEqual([id, current, older]);
  });

  it("refusals: malformed ids 400; unknown teacher 404; the current one 409; a stale screen 409 — nothing written", async () => {
    const [older, current] = await twoRevisions(ctx);
    const before = ctx.mem.names(REVISION_PREFIX).length;
    expect((await rollback(ctx, { accountId: "../x", revisionId: older })).status).toBe(400);
    expect((await rollback(ctx, { revisionId: "ar_../../x" })).jsonBody.code).toBe("REVISION_ID_INVALID");
    expect((await rollback(ctx, { accountId: "t_99887766554433aa", revisionId: older })).status).toBe(404);
    const same = await rollback(ctx, { revisionId: current });
    expect([same.status, same.jsonBody.code]).toEqual([409, "ROLLBACK_ALREADY_CURRENT"]);
    const stale = await rollback(ctx, { revisionId: older, baseRevisionId: older });
    expect([stale.status, stale.jsonBody.code]).toEqual([409, "ACCESS_CONFLICT"]);
    expect(ctx.mem.names(REVISION_PREFIX)).toHaveLength(before);
    expect(ctx.mem.getJson(teacherAccountName(SARA)).accessRevisionId).toBe(current);
  });

  it("only a revision on THIS account's chain: another teacher's, or an orphan, is refused", async () => {
    const [, current] = await twoRevisions(ctx);
    const other = buildRevision({ accountId: OMAR, presetId: "legacy-full", presetVersion: 1, createdBy: "owner:x" }).revision;
    ctx.mem.setJson(revisionName(other.revisionId), other);
    const orphan = buildRevision({ accountId: SARA, parentRevisionId: current, presetId: "legacy-full", presetVersion: 1, createdBy: "owner:x" }).revision;
    ctx.mem.setJson(revisionName(orphan.revisionId), orphan);
    for (const revisionId of [other.revisionId, orphan.revisionId]) {
      const r = await rollback(ctx, { revisionId });
      expect([r.status, r.jsonBody.code]).toEqual([409, "ROLLBACK_NOT_IN_HISTORY"]);
    }
    expect(ctx.mem.getJson(teacherAccountName(SARA)).accessRevisionId).toBe(current);
  });

  it("a revision on the chain that no longer validates cannot be restored (fail closed)", async () => {
    const [older, current] = await twoRevisions(ctx);
    resetRevisionCache();
    ctx.mem.setJson(revisionName(older), { ...ctx.mem.getJson(revisionName(older)), grants: ["platform.operations.run"] });
    const r = await rollback(ctx, { revisionId: older });
    expect([r.status, r.jsonBody.code]).toEqual([409, "ROLLBACK_TARGET_INVALID"]);
    expect(ctx.mem.getJson(teacherAccountName(SARA)).accessRevisionId).toBe(current);
  });

  it("a concurrent change between the read and the pointer swap → 409, the pointer keeps the winner", async () => {
    const [older, current] = await twoRevisions(ctx);
    const [a, b] = await Promise.all([rollback(ctx, { revisionId: older, baseRevisionId: current }), assign(ctx, { presetId: "learning-ready-assignments", baseRevisionId: current })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = [a, b].find(r => r.status === 200).jsonBody.access.revisionId;
    expect(ctx.mem.getJson(teacherAccountName(SARA)).accessRevisionId).toBe(winner);
  });
});

describe("P4-B1 suspension reason", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("stored trimmed (≤ 200), shown to the owner, audited; cleared on reactivation; empty while not suspended", async () => {
    const list = async () => (await ownerTeachers(req({ method: "GET", headers: ctx.owner }), ctx.deps)).jsonBody.teachers.find(t => t.accountId === SARA);
    expect(await list()).toMatchObject({ suspendedAt: "", suspendedReason: "" });
    const r = await teacherAct(ctx, "suspend", { reason: "  مخالفة   " + "س".repeat(300) });
    expect(r.status).toBe(200);
    expect(r.jsonBody.teacher.status).toBe("suspended");
    expect(r.jsonBody.teacher.suspendedReason).toBe(("مخالفة " + "س".repeat(300)).slice(0, 200));
    expect(r.jsonBody.teacher.suspendedAt).not.toBe("");
    expect(audits(ctx).find(e => e.action === "owner.teacher.suspend").details).toEqual({ reason: r.jsonBody.teacher.suspendedReason });
    const back = await teacherAct(ctx, "reactivate");
    expect(back.jsonBody.teacher).toMatchObject({ status: "active", suspendedAt: "", suspendedReason: "" });
    expect(ctx.mem.getJson(teacherAccountName(SARA)).suspendedReason).toBe(null);
  });

  it("without a reason: suspended as before, no audit details; the teacher is refused and never sees a reason", async () => {
    const r = await teacherAct(ctx, "suspend");
    expect(r.jsonBody.teacher).toMatchObject({ status: "suspended", suspendedReason: "" });
    expect(audits(ctx).find(e => e.action === "owner.teacher.suspend").details).toEqual({});
    await teacherAct(ctx, "reactivate");
    await teacherAct(ctx, "suspend", { reason: "سبب سري للمالك" });
    const p = await platformSession(req({ method: "GET", headers: { "x-builder-token": ctx.saraToken } }), ctx.deps);
    expect(p.status).toBe(401);
    expect(JSON.stringify(p.jsonBody)).not.toContain("سبب سري");
  });
});
