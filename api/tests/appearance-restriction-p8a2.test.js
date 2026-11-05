import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P8-A2 — the owner restricts the appearance values of ONE teacher (`resources.appearance` of the access revision; a part absent
// = every value; the part's default always allowed), applied with the capabilities (enforce only): the server refuses a value outside
// it, GET reports what is allowed, a stored value no longer allowed reads back as the default (nothing deleted); the owner's routes
// carry it. A feature (no fail-first). TEST data only.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p8a2-appearance-owner-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: profile } = await import("../src/functions/teacher-profile.js");
const { handler: ownerAccess } = await import("../src/functions/owner-access.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { evaluateRevision } = await import("../src/lib/access/revisions.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { profileDocName } = await import("../src/lib/teacher-profile.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa";
function setup({ mode = "enforce", appearance } = {}) {
  resetRevisionCache(); resetOperatorGateCache();
  const mem = createMemoryContainer();
  const { revision } = buildRevision({ accountId: SARA, presetId: "full-teaching", presetVersion: 2, createdBy: "owner:x", ...(appearance ? { resources: { appearance } } : {}) });
  mem.setJson(revisionName(revision.revisionId), revision);
  mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version: 2 } });
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  const token = recordedManagedToken(mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token;
  return { mem, token, deps: { getContainer: () => mem.container, container: mem.container } };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const tHdr = ctx => hdr({ "x-builder-token": ctx.token });
const get = ctx => profile({ method: "GET", url: "https://x/api/teacher-profile", headers: tHdr(ctx) }, ctx.deps);
const set = (ctx, appearance) => profile({ method: "POST", url: "https://x/api/teacher-profile", headers: tHdr(ctx), json: async () => ({ action: "setAppearance", appearance }) }, ctx.deps);
const ALL = { theme: ["light", "dark"], palette: ["default", "ocean", "forest", "sand"], density: ["comfortable", "compact"] };

describe("P8-A2 — the revision's appearance restriction", () => {
  const base = { accountId: SARA, presetId: "full-teaching", presetVersion: 2, createdBy: "owner:x" };
  it("known parts and values only, no duplicates; stored in the registry's order; absent = no restriction", () => {
    expect(evaluateRevision(buildRevision({ ...base, resources: { appearance: { palette: ["sand", "default"], theme: ["light"] } } }).revision).appearance).toEqual({ palette: ["default", "sand"], theme: ["light"] });
    expect(evaluateRevision(buildRevision(base).revision).appearance).toBeNull();
    for (const bad of [{ font: ["big"] }, { palette: ["neon"] }, { palette: "ocean" }, { palette: ["ocean", "ocean"] }, ["palette"], null]) {
      expect(() => buildRevision({ ...base, resources: { appearance: bad } }), JSON.stringify(bad)).toThrow(/APPEARANCE_RESOURCE_INVALID/);
    }
  });
});

describe("P8-A2 — the teacher's choice follows the owner's restriction", () => {
  it("GET reports the allowed values (the default always included); a value outside → 403 APPEARANCE_NOT_ALLOWED, nothing stored", async () => {
    const ctx = setup({ appearance: { palette: ["ocean"], density: [] } });
    expect((await get(ctx)).jsonBody.appearanceAllowed).toEqual({ theme: ALL.theme, palette: ["default", "ocean"], density: ["comfortable"] });
    const r = await set(ctx, { palette: "sand" });
    expect([r.status, r.jsonBody.code, r.jsonBody.part, r.jsonBody.value]).toEqual([403, "APPEARANCE_NOT_ALLOWED", "palette", "sand"]);
    expect((await set(ctx, { density: "compact" })).jsonBody.code).toBe("APPEARANCE_NOT_ALLOWED");
    expect(ctx.mem.getJson(profileDocName(SARA))).toBeNull();
    expect((await set(ctx, { palette: "ocean" })).jsonBody.appearance.palette).toBe("ocean");
    expect((await set(ctx, { palette: "default", density: "comfortable" })).status).toBe(200);   // the default: always
  });
  it("a value the owner no longer allows reads back as the default — and is not deleted", async () => {
    const ctx = setup({ appearance: { palette: ["ocean"] } });
    ctx.mem.setJson(profileDocName(SARA), { schemaVersion: 1, teacherId: SARA, appearance: { palette: "sand", density: "compact" } });
    expect((await get(ctx)).jsonBody.appearance).toEqual({ theme: "light", palette: "default", density: "compact" });
    expect(ctx.mem.getJson(profileDocName(SARA)).appearance.palette).toBe("sand");
  });
  it("observe / legacy mode: nothing is restricted (the choice applies with enforcement); no restriction: every value", async () => {
    for (const mode of ["observe", "legacy"]) {
      const ctx = setup({ mode, appearance: { palette: [] } });
      expect((await set(ctx, { palette: "sand" })).status).toBe(200);
      expect((await get(ctx)).jsonBody.appearanceAllowed).toEqual(ALL);
    }
    expect((await get(setup())).jsonBody.appearanceAllowed).toEqual(ALL);
  });
});

describe("P8-A2 — the owner's API carries the appearance restriction", () => {
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
  it("catalog, assign (validated), effective, history and rollback; the games stay beside it", async () => {
    const ctx = setup();
    const owner = withOwner(ctx);
    expect((await oa(ctx, owner, "GET", "")).jsonBody.appearance.map(p => [p.part, p.fallback])).toEqual([["theme", "light"], ["palette", "default"], ["density", "comfortable"]]);
    const acc = () => ctx.mem.getJson(teacherAccountName(SARA));
    const assign = body => oa(ctx, owner, "POST", "assign", { accountId: SARA, presetId: "full-teaching", presetVersion: 2, baseRevisionId: acc().accessRevisionId, ...body });
    expect((await assign({ appearance: { palette: ["neon"] } })).jsonBody.code).toBe("APPEARANCE_RESOURCE_INVALID");
    const first = acc().accessRevisionId;
    const r = await assign({ appearance: { palette: ["forest"] }, games: ["live-challenge"] });
    expect([r.status, r.jsonBody.appearance, r.jsonBody.games]).toEqual([200, { palette: ["forest"] }, ["live-challenge"]]);
    expect((await oa(ctx, owner, "GET", "effective", {}, { accountId: SARA })).jsonBody.access.appearance).toEqual({ palette: ["forest"] });
    expect((await set(ctx, { palette: "ocean" })).jsonBody.code).toBe("APPEARANCE_NOT_ALLOWED");
    expect((await oa(ctx, owner, "GET", "history", {}, { accountId: SARA })).jsonBody.entries.map(e => e.appearance)).toEqual([{ palette: ["forest"] }, null]);
    const back = await oa(ctx, owner, "POST", "rollback", { accountId: SARA, revisionId: first, baseRevisionId: r.jsonBody.access.revisionId });
    expect([back.status, back.jsonBody.appearance]).toEqual([200, null]);
    expect((await set(ctx, { palette: "ocean" })).status).toBe(200);
    const again = await oa(ctx, owner, "POST", "rollback", { accountId: SARA, revisionId: r.jsonBody.access.revisionId, baseRevisionId: back.jsonBody.access.revisionId });
    expect([again.status, again.jsonBody.appearance, again.jsonBody.games]).toEqual([200, { palette: ["forest"] }, ["live-challenge"]]);
  });
});
