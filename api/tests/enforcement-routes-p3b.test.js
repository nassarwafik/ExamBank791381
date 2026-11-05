import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// The routes load their libraries with require(): reset THOSE instances (an ESM import is a separate module instance here).
const cjs = createRequire(import.meta.url);

// Tadris+ P3-B — real routes under the three modes, for managed teachers with different presets (TEST data only).
//   legacy (default): nothing changes, even for a teacher without access · observe: nothing is blocked, «would deny» is recorded
//   and shown to the owner (readiness) · enforce (the owner cannot choose it yet — written directly here): the capability decides.
// Mandatory blueprint test #1: a learning-only teacher cannot open the exam builder APIs. D18: no class creation in a teaching
// preset. Identities that predate the console are never affected.

process.env.BANK_SETUP_KEY = "p3b-enforcement-root-secret";
process.env.BUILDER_PASSWORD = "shared";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { handler: students } = await import("../src/functions/manage-students.js");
const { handler: savedExams } = await import("../src/functions/manage-saved-exams.js");
const { handler: aiAuthor } = await import("../src/functions/ai-question-author.js");
const { handler: messages } = await import("../src/functions/messages.js");
const { handler: ownerAccess } = await import("../src/functions/owner-access.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");
const { buildRevision, resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { observationName, resetObservationThrottle } = cjs("../src/lib/access/observations.js");

const A = "t_000000000000000a", C = "t_000000000000000c", U = "t_00000000000000ff";
const OWNER_ID = "own_0011223344556677";

function req({ method = "POST", body = {}, headers = {}, url = "https://x.invalid/api/x", action = "" } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, url, params: { action }, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body, text: async () => JSON.stringify(body) };
}
const H = token => ({ "x-builder-token": token, authorization: "Bearer " + token });

function setup() {
  resetOperatorGateCache(); resetRevisionCache(); resetObservationThrottle();
  const mem = createMemoryContainer({ "platform/classes/c-old.json": { classId: "c-old", name: "صف", status: "active", studentIds: [] } });
  const deps = { getContainer: () => mem.container };
  const tokens = {};
  const account = (id, presetId) => {
    let accessRevisionId;
    if (presetId) {
      const { revision } = buildRevision({ accountId: id, presetId, presetVersion: 1, createdBy: "owner:" + OWNER_ID });
      mem.setJson("platform/access/revisions/" + revision.revisionId + ".json", revision);
      accessRevisionId = revision.revisionId;
    }
    mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username: "u" + id.slice(-1), displayName: "معلم " + id.slice(-1), status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], ...(accessRevisionId ? { accessRevisionId, accessPreset: { id: presetId, version: 1 } } : {}) });
    tokens[id] = recordedManagedToken(mem, { accountId: id, sid: newTeacherSessionId(), authVersion: 1 }).token;
  };
  account(A, "learning-only"); account(C, "full-teaching"); account(U, null);
  const mode = m => mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: m });
  return { mem, deps, tokens, mode };
}

const listClasses = (ctx, id) => classrooms(req({ method: "GET", headers: H(ctx.tokens[id]) }), ctx.deps);
const createClass = (ctx, token) => classrooms(req({ body: { action: "create", name: "صف جديد", grade: "10", schoolYear: "2026-2027" }, headers: H(token) }), ctx.deps);
const savedList = (ctx, id) => savedExams(req({ method: "GET", headers: H(ctx.tokens[id]) }), ctx.deps);
const author = (ctx, id) => aiAuthor(req({ body: { request: "سؤال اختيار من متعدد عن الشبكات" }, headers: H(ctx.tokens[id]) }), { ...ctx.deps, callTextJson: async () => { throw new Error("provider not reached in this test"); } });
const inbox = (ctx, id) => messages(req({ method: "GET", headers: H(ctx.tokens[id]) }), ctx.deps);

describe("P3-B legacy mode (the default) changes nothing", () => {
  it("even a teacher with no access uses every route as before", async () => {
    const ctx = setup();
    expect((await listClasses(ctx, U)).status).toBe(200);
    expect((await savedList(ctx, U)).status).toBe(200);
    expect((await author(ctx, U)).status).not.toBe(403);
    expect(ctx.mem.names("platform/access/observations/")).toEqual([]);
  });
});

describe("P3-B observe mode never blocks, and records what it would have refused", () => {
  it("allowed; the refusal that enforcement would make is recorded per teacher and capability", async () => {
    const ctx = setup(); ctx.mode("observe");
    expect((await listClasses(ctx, U)).status).toBe(200);
    expect((await author(ctx, A)).status).not.toBe(403);
    expect((await listClasses(ctx, A)).status).toBe(200);                 // granted: nothing recorded for it
    expect(Object.keys(ctx.mem.getJson(observationName(U)).capabilities)).toEqual(["classes.class.view"]);
    expect(Object.keys(ctx.mem.getJson(observationName(A)).capabilities)).toEqual(["examBuilder.ai.use"]);
    expect(ctx.mem.has(observationName(C))).toBe(false);
  });
});

describe("P3-B enforce mode (written directly: the owner cannot choose it before P3-B2)", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); ctx.mode("enforce"); });

  it("blueprint test #1: a learning-only teacher does not open the exam builder or its AI", async () => {
    for (const r of [await savedList(ctx, A), await author(ctx, A)]) {
      expect(r.status).toBe(403);
      expect(r.jsonBody.code).toBe("CAPABILITY_DENIED");
    }
    expect((await listClasses(ctx, A)).status).toBe(200);
    expect((await inbox(ctx, A)).status).toBe(403);                      // no messages in learning-only
  });
  it("full teaching opens the builder and its AI, but (D18) does not create classes", async () => {
    expect((await savedList(ctx, C)).status).toBe(200);
    expect((await author(ctx, C)).status).not.toBe(403);
    const r = await createClass(ctx, ctx.tokens[C]);
    expect(r.status).toBe(403);
    expect(r.jsonBody.capability).toBe("classes.class.create");
    expect(ctx.mem.names("platform/classes/")).toEqual(["platform/classes/c-old.json"]);
  });
  it("D18 on the students route: full teaching archives (and restores) but never deletes permanently — single or bulk", async () => {
    const act = (id, body) => students(req({ body, headers: H(ctx.tokens[id]) }), ctx.deps);
    const del = await act(C, { action: "delete", userId: "u-1" });
    expect(del.status).toBe(403);
    expect(del.jsonBody.capability).toBe("students.student.delete");
    expect((await act(C, { action: "bulkaction", operation: "delete", userIds: ["u-1"] })).jsonBody.capability).toBe("students.student.delete");
    for (const body of [{ action: "archive", userId: "u-1" }, { action: "unarchive", userId: "u-1" }, { action: "bulkaction", operation: "archive", userIds: ["u-1"] }]) {
      expect((await act(C, body)).status, JSON.stringify(body)).not.toBe(403);
    }
    expect((await act(A, { action: "bulkaction", operation: "move", userIds: ["u-1"], targetClassId: "c-old" })).jsonBody.capability).toBe("students.student.move");
  });
  it("default deny: a teacher the owner has not given access to can do nothing", async () => {
    expect((await listClasses(ctx, U)).status).toBe(403);
    expect((await inbox(ctx, U)).status).toBe(403);
  });
  it("a shared-password session (no owner yet) is not affected", async () => {
    const legacy = createBuilderToken("teacher");
    expect((await classrooms(req({ method: "GET", headers: H(legacy) }), ctx.deps)).status).toBe(200);
    expect((await createClass(ctx, legacy)).status).not.toBe(403);
  });
  it("the imported workspace (t_legacy) without an assignment keeps today's access", async () => {
    ctx.mem.setJson(teacherAccountName("t_legacy"), { schemaVersion: 1, accountId: "t_legacy", role: "teacher", username: "w.nassar", displayName: "وفيق", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], origin: "shared-password-workspace" });
    const token = recordedManagedToken(ctx.mem, { accountId: "t_legacy", sid: newTeacherSessionId(), authVersion: 1 }).token;
    expect((await createClass(ctx, token)).status).not.toBe(403);
  });
  it("the mode or a revision cannot be read → 503, never allowed", async () => {
    ctx.mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "unknown" });
    expect((await listClasses(ctx, C)).status).toBe(503);
    ctx.mode("enforce");
    const a = ctx.mem.getJson(teacherAccountName(C));
    ctx.mem.setJson(teacherAccountName(C), { ...a, accessRevisionId: "ar_000000009_ffffffffffffffff" });
    expect((await listClasses(ctx, C)).status).toBe(503);
  });
});

describe("P3-B owner readiness", () => {
  it("lists every teacher's access in force and what observe recorded; ready only when nobody active is left without access", async () => {
    const ctx = setup(); ctx.mode("observe");
    const now = Date.now();
    ctx.mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
    ctx.mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
    const sid = "c".repeat(32);
    ctx.mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now });
    const owner = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
    ctx.mem.setJson(teacherAccountName("t_legacy"), { schemaVersion: 1, accountId: "t_legacy", role: "teacher", username: "w.nassar", displayName: "وفيق", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], origin: "shared-password-workspace" });
    await listClasses(ctx, U);
    const r = await ownerAccess(req({ method: "GET", action: "readiness", headers: owner }), ctx.deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, mode: "observe", ready: false });
    const byId = Object.fromEntries(r.jsonBody.teachers.map(t => [t.accountId, t]));
    expect(byId[U]).toMatchObject({ access: null, defaultAccess: "none" });
    expect(byId[U].wouldDeny.map(w => w.capability)).toEqual(["classes.class.view"]);
    expect(byId[C].access.preset).toEqual({ id: "full-teaching", version: 1 });
    expect(byId.t_legacy).toMatchObject({ access: null, defaultAccess: "legacy-full" });     // counts as ready (D7)
    // Assign U → ready.
    expect((await ownerAccess(req({ action: "assign", headers: owner, body: { accountId: U, presetId: "learning-only", presetVersion: 1 } }), ctx.deps)).status).toBe(200);
    expect((await ownerAccess(req({ method: "GET", action: "readiness", headers: owner }), ctx.deps)).jsonBody.ready).toBe(true);
    // A teacher token never reads it.
    expect((await ownerAccess(req({ method: "GET", action: "readiness", headers: H(ctx.tokens[C]) }), ctx.deps)).status).toBe(401);
  });
});
