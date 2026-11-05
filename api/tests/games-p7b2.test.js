import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P7-B2 — the educational games (blueprint §10.3, owner decision §19.25):
//   the class check of the Number Conversion game (the student plays only from a CURRENT class that exists and is not archived);
//   a game is open to a teacher = its capability AND the owner's game choice (`resources.games`; absent = every game), enforce
//   only; a student plays only the games open to their teacher; the owner's routes carry the choice. TEST data only.
// The first block is the FAIL-FIRST proof: on the baseline (before P7-B2) a student of an ARCHIVED class, a student with NO class,
// and the student of a «التعلّم فقط» teacher (no games) still started a Number Conversion round while the owner enforced access.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p7b2-games-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: conversion } = await import("../src/functions/game-number-conversion.js");
const { handler: preview } = await import("../src/functions/game-number-conversion-preview.js");
const { handler: liveChallenge } = await import("../src/functions/game-live-challenge.js");
const { handler: liveStudent } = await import("../src/functions/game-live-session-student.js");
const { handler: notifications } = await import("../src/functions/student-notifications.js");
const { handler: ownerAccess } = await import("../src/functions/owner-access.js");
const { gameDocName } = await import("../src/lib/number-conversion-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { createStudentToken } = await import("../src/lib/student-auth.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { sessionAccess } = await import("../src/lib/access/session-access.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { GAMES } = await import("../src/lib/game-catalog.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa";
const S1 = "11111111-1111-1111-1111-111111111111";
const ALL = GAMES.map(g => g.id);

function setup({ mode = "enforce", preset = "full-teaching", version = 2, games, classStatus = "active", classId = "c1" } = {}) {
  resetRevisionCache(); resetOperatorGateCache();
  const mem = createMemoryContainer();
  const { revision } = buildRevision({ accountId: SARA, presetId: preset, presetVersion: version, createdBy: "owner:x", ...(games ? { resources: { games } } : {}) });
  mem.setJson(revisionName(revision.revisionId), revision);
  mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: preset, version } });
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  mem.setJson("platform/classes/c1.json", { classId: "c1", name: "صف سارة", status: classStatus, active: classStatus === "active", ownerId: SARA });
  mem.setJson("platform/users/" + S1 + ".json", { schemaVersion: 3, userId: S1, role: "student", code: "1001", displayName: "ليان", ...(classId ? { classId } : {}), active: true, archived: false, authVersion: 1, createdAt: "2026-01-01T00:00:00.000Z" });
  const student = { "x-student-token": createStudentToken({ userId: S1, authVersion: 1, code: "1001", displayName: "ليان", classId: classId || "" }) };
  const teacher = { "x-builder-token": recordedManagedToken(mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token };
  return { mem, deps: { getContainer: () => mem.container, container: mem.container }, student, teacher };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const start = ctx => conversion({ method: "POST", url: "https://x/api/game-number-conversion/start", params: { action: "start" }, json: async () => ({ path: "mixed", level: "guided" }), headers: hdr(ctx.student) }, ctx.deps);
const state = ctx => conversion({ method: "GET", url: "https://x/api/game-number-conversion", params: {}, headers: hdr(ctx.student) }, ctx.deps);

describe("P7-B2 fail-first — the Number Conversion game", () => {
  it("a student of an ARCHIVED class cannot play (and nothing is stored)", async () => {
    const ctx = setup({ classStatus: "archived" });
    const r = await start(ctx);
    expect([r.status, r.jsonBody.code]).toEqual([403, "NO_ACTIVE_CLASS"]);
    expect(ctx.mem.has(gameDocName(S1))).toBe(false);
  });
  it("a student with NO class cannot play", async () => {
    const r = await start(setup({ classId: null }));
    expect([r.status, r.jsonBody.code]).toEqual([403, "NO_ACTIVE_CLASS"]);
  });
  it("the student of a teacher without games (learning-only, enforce) cannot play", async () => {
    const ctx = setup({ preset: "learning-only", version: 1 });
    const r = await start(ctx);
    expect([r.status, r.jsonBody.code, r.jsonBody.service]).toEqual([403, "SERVICE_NOT_AVAILABLE", "game:number-conversion"]);
    expect(ctx.mem.has(gameDocName(S1))).toBe(false);
  });
});

describe("P7-B2 — games follow the teacher's access and the owner's game choice", () => {
  it("a current class and a teacher who may: the round starts, and the state reads back", async () => {
    const ctx = setup();
    expect((await start(ctx)).status).toBe(200);
    expect((await state(ctx)).status).toBe(200);
  });
  it("the owner left the game out for this teacher: the student cannot play it, nor the teacher preview it", async () => {
    const ctx = setup({ games: ["live-challenge"] });
    expect((await start(ctx)).jsonBody.code).toBe("SERVICE_NOT_AVAILABLE");
    const p = await preview({ method: "POST", url: "https://x/api/game-number-conversion-preview/start", params: { action: "start" }, json: async () => ({ path: "mixed", level: "guided" }), headers: hdr(ctx.teacher) }, ctx.deps);
    expect([p.status, p.jsonBody.code, p.jsonBody.game]).toEqual([403, "GAME_NOT_AVAILABLE", "number-conversion"]);
  });
  it("the live challenge left out: the teacher's challenges and the student's room are refused", async () => {
    const ctx = setup({ games: ["number-conversion"] });
    const t = await liveChallenge({ method: "GET", url: "https://x/api/game-live-challenge", params: {}, headers: hdr(ctx.teacher), json: async () => ({}) }, ctx.deps);
    expect([t.status, t.jsonBody.code]).toEqual([403, "GAME_NOT_AVAILABLE"]);
    const s = await liveStudent({ method: "POST", url: "https://x/api/game-live-session-student/join", params: { action: "join" }, headers: hdr(ctx.student), json: async () => ({ joinCode: "ABC123" }) }, ctx.deps);
    expect([s.status, s.jsonBody.code]).toEqual([403, "SERVICE_NOT_AVAILABLE"]);
    expect((await start(ctx)).status).toBe(200);
  });
  it("the bell's `services.games` lists the games open to the student's teacher", async () => {
    const svc = async ctx => (await notifications({ method: "GET", url: "https://x/api/student-notifications?view=unread", headers: hdr(ctx.student) }, ctx.deps)).jsonBody.services.games;
    expect(await svc(setup())).toEqual(ALL);
    expect(await svc(setup({ games: ["live-challenge"] }))).toEqual(["live-challenge"]);
    expect(await svc(setup({ preset: "learning-only", version: 1 }))).toEqual([]);
    expect(await svc(setup({ preset: "learning-ready-assignments", version: 1 }))).toEqual(ALL);
  });
  it("the teacher's session tells the UI which games are open (enforced); before enforcement: every game", async () => {
    const access = async ctx => (await sessionAccess({ am: "managed", sub: SARA, accessRevisionId: ctx.mem.getJson(teacherAccountName(SARA)).accessRevisionId }, ctx.deps)).games;
    expect(await access(setup({ games: ["live-challenge"] }))).toEqual(["live-challenge"]);
    expect(await access(setup({ preset: "learning-only", version: 1 }))).toEqual([]);
    expect(await access(setup({ mode: "observe", preset: "learning-only", version: 1 }))).toEqual(ALL);
  });
  it("observe / legacy mode: nothing is narrowed (the class check stays)", async () => {
    for (const mode of ["observe", "legacy"]) {
      expect((await start(setup({ mode, preset: "learning-only", version: 1, games: [] }))).status).toBe(200);
      expect((await start(setup({ mode, classStatus: "archived" }))).jsonBody.code).toBe("NO_ACTIVE_CLASS");
    }
  });
  it("the choice never widens the capabilities: learning-only + every game id → still no game", async () => {
    expect((await start(setup({ preset: "learning-only", version: 1, games: ALL }))).jsonBody.code).toBe("SERVICE_NOT_AVAILABLE");
  });
  it("revision validation: unknown or duplicated game ids are refused; a stored unknown id is not trusted (503)", async () => {
    const base = { accountId: SARA, presetId: "full-teaching", presetVersion: 2, createdBy: "owner:x" };
    expect(() => buildRevision({ ...base, resources: { games: ["chess"] } })).toThrow(/GAME_UNKNOWN/);
    expect(() => buildRevision({ ...base, resources: { games: ["live-challenge", "live-challenge"] } })).toThrow(/GAME_DUPLICATE/);
    const ctx = setup();
    const acc = ctx.mem.getJson(teacherAccountName(SARA));
    ctx.mem.setJson(revisionName(acc.accessRevisionId), { ...ctx.mem.getJson(revisionName(acc.accessRevisionId)), resources: { games: ["chess"] } });
    resetRevisionCache();
    expect((await start(ctx)).status).toBe(503);
  });
});

describe("P7-B2 — the owner's API carries the games", () => {
  const OWNER = "own_0011223344556677";
  function withOwner(ctx) {
    const now = Date.now();
    ctx.mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER, completedAtMs: now });
    ctx.mem.setJson(ownerAccountName(OWNER), { schemaVersion: 1, accountId: OWNER, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
    const sid = "c".repeat(32);
    ctx.mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now });
    return { "x-owner-token": createOwnerToken({ accountId: OWNER, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  const oa = (ctx, h, method, action, body = {}, query = null) => ownerAccess({ method, params: { action }, ...(query ? { query: new URLSearchParams(query) } : {}), headers: hdr(h), json: async () => body }, ctx.deps);
  it("catalog, assign (validated), effective, history and rollback; the widgets and courses stay", async () => {
    const ctx = setup();
    const owner = withOwner(ctx);
    expect((await oa(ctx, owner, "GET", "")).jsonBody.games.map(g => g.id)).toEqual(ALL);
    const acc = () => ctx.mem.getJson(teacherAccountName(SARA));
    const assign = body => oa(ctx, owner, "POST", "assign", { accountId: SARA, presetId: "full-teaching", presetVersion: 2, baseRevisionId: acc().accessRevisionId, ...body });
    expect((await assign({ games: ["chess"] })).jsonBody.code).toBe("GAME_UNKNOWN");
    const first = acc().accessRevisionId;
    const r = await assign({ games: ["live-challenge"], widgets: ["insights"] });
    expect([r.status, r.jsonBody.games, r.jsonBody.widgets]).toEqual([200, ["live-challenge"], ["insights"]]);
    expect(ctx.mem.getJson(revisionName(r.jsonBody.access.revisionId)).resources).toEqual({ widgets: ["insights"], games: ["live-challenge"] });
    expect((await oa(ctx, owner, "GET", "effective", {}, { accountId: SARA })).jsonBody.access.games).toEqual(["live-challenge"]);
    expect((await start(ctx)).jsonBody.code).toBe("SERVICE_NOT_AVAILABLE");
    expect((await oa(ctx, owner, "GET", "history", {}, { accountId: SARA })).jsonBody.entries.map(e => e.games)).toEqual([["live-challenge"], null]);
    const back = await oa(ctx, owner, "POST", "rollback", { accountId: SARA, revisionId: first, baseRevisionId: r.jsonBody.access.revisionId });
    expect([back.status, back.jsonBody.games]).toEqual([200, null]);
    expect((await start(ctx)).status).toBe(200);
    const again = await oa(ctx, owner, "POST", "rollback", { accountId: SARA, revisionId: r.jsonBody.access.revisionId, baseRevisionId: back.jsonBody.access.revisionId });
    expect([again.status, again.jsonBody.games, again.jsonBody.widgets]).toEqual([200, ["live-challenge"], ["insights"]]);
  });
});
