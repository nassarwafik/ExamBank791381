import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P6-D — each teacher's own exam bank (owner direction, blueprint §19.19). TEST data only; real owner and managed sessions.
//   every library exam has an audience: «all» (every teacher's bank) or «selected» (only the teachers listed);
//   launch default: the 36 exams shipped before P6-D are «all» (nobody loses anything); an exam added later starts for nobody;
//   the owner chooses two ways — one exam for a group / everyone (set-audience), or one teacher's bank (set-teacher);
//   a teacher's catalog lists only their bank (its own ETag); another exam is answered like a missing one — item, copy, and
//   assigning it by reference; a published assignment is never touched; applied like the course entitlement: managed sessions,
//   while ENFORCING (identities that predate the console keep the whole library); an unreadable audience fails closed (503).

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p6d-teacher-exam-bank-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: ownerLibrary } = await import("../src/functions/owner-library.js");
const { handler: library } = await import("../src/functions/exam-library.js");
const { handler: assignments } = await import("../src/functions/manage-assignments.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const LA = cjs("../src/lib/access/library-access.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const OWNER_ID = "own_0011223344556677";
const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";
const ALL36 = ["F01", "F02", "F03", "F04", "F05", "F06", ...Array.from({ length: 30 }, (_, i) => "T" + String(i + 1).padStart(2, "0"))];

function setup({ mode = "enforce" } = {}) {
  resetRevisionCache(); resetOperatorGateCache();
  const mem = createMemoryContainer({ "platform/classes/cA.json": { classId: "cA", name: "صف سارة", active: true, status: "active", ownerId: SARA }, "platform/classes/cB.json": { classId: "cB", name: "صف عمر", active: true, status: "active", ownerId: OMAR } });
  const now = Date.now();
  for (const [id, username] of [[SARA, "t.sara"], [OMAR, "t.omar"]]) {
    const { revision } = buildRevision({ accountId: id, presetId: "full-teaching", presetVersion: 1, createdBy: "owner:x" });
    mem.setJson(revisionName(revision.revisionId), revision);
    mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: username, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version: 1 } });
  }
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const heads = {};
  for (const [name, ago] of [["owner", 0], ["ownerStale", 11 * 60 * 1000]]) {
    const sid = (ago ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - ago });
    heads[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  let clock = Date.parse("2026-11-03T10:00:00.000Z");
  const deps = { getContainer: () => mem.container, container: mem.container, now: () => new Date((clock += 1000)).toISOString(), ensurePublishedAssignmentIndexed: async () => {}, recordAuditEvent: async () => {}, recordEventSafely: async () => {} };
  const tok = id => ({ "x-builder-token": recordedManagedToken(mem, { accountId: id, sid: newTeacherSessionId(), authVersion: 1 }, { nowMs: clock }).token });
  return { mem, deps, ...heads, sara: tok(SARA), omar: tok(OMAR) };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const oreq = (method, action, headers, body = {}) => ({ method, url: "https://x/api/owner-library", params: { action }, headers: hdr(headers), json: async () => body });
const owner = (ctx, action, body, headers = ctx.owner) => ownerLibrary(oreq("POST", action, headers, body), { getContainer: () => ctx.mem.container });
const ownerGet = (ctx, headers = ctx.owner) => ownerLibrary(oreq("GET", "", headers), { getContainer: () => ctx.mem.container });
const catalog = (ctx, headers, extra = {}) => library({ method: "GET", url: "https://x", params: {}, headers: hdr({ ...headers, ...extra }) }, ctx.deps);
const item = (ctx, headers, id) => library({ method: "GET", url: "https://x", params: { id }, headers: hdr(headers) }, ctx.deps);
const bankOf = async (ctx, headers) => (await catalog(ctx, headers)).jsonBody.catalog.map(i => i.libraryItemId);
const assign = (ctx, headers, classId, itemId) => assignments({ method: "POST", url: "http://x/assignments", params: {}, headers: hdr(headers), json: async () => ({ action: "create", classId, title: "واجب", publish: true, libraryRef: { itemId } }) }, ctx.deps);
const audits = ctx => ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));

describe("P6-D launch default — nobody loses anything on day one", () => {
  it("with no audience chosen, every teacher's bank is the 36 launch exams; an exam added to the library later starts for nobody", async () => {
    const ctx = setup();
    expect(await bankOf(ctx, ctx.sara)).toEqual(ALL36);
    expect(await bankOf(ctx, ctx.omar)).toEqual(ALL36);
    expect(LA.audienceOf({ items: {} }, "F01")).toMatchObject({ audience: "all", stored: false });
    expect(LA.audienceOf({ items: {} }, "T31")).toMatchObject({ audience: "selected", teachers: [], stored: false });
    expect(LA.inBank({ items: {} }, "T31", SARA)).toBe(false);
    expect([...LA.LAUNCH_ITEMS]).toEqual(ALL36);
  });
});

describe("P6-D one exam for a group of teachers, or for everyone", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });
  it("an exam for Sara only: in her bank, not in Omar's — his catalog, item, and assigning it all answer like a missing exam", async () => {
    const r = await owner(ctx, "set-audience", { itemId: "T05", audience: "selected", teachers: [SARA] });
    expect([r.status, r.jsonBody.item]).toEqual([200, { libraryItemId: "T05", audience: "selected", teachers: [SARA], decided: true }]);
    expect(await bankOf(ctx, ctx.sara)).toContain("T05");
    expect(await bankOf(ctx, ctx.omar)).not.toContain("T05");
    expect((await item(ctx, ctx.omar, "T05")).status).toBe(404);
    expect((await item(ctx, ctx.sara, "T05")).status).toBe(200);
    const denied = await assign(ctx, ctx.omar, "cB", "T05");
    expect([denied.status, denied.jsonBody.code]).toEqual([404, "LIBRARY_ITEM_NOT_FOUND"]);
    expect(ctx.mem.names("platform/assignments/")).toEqual([]);
    expect((await assign(ctx, ctx.sara, "cA", "T05")).status).toBe(200);
  });
  it("a group, then everyone again; each change audited with who was added / removed", async () => {
    await owner(ctx, "set-audience", { itemId: "F01", audience: "selected", teachers: [SARA, OMAR, SARA] });
    expect(await bankOf(ctx, ctx.sara)).toContain("F01");
    expect(await bankOf(ctx, ctx.omar)).toContain("F01");
    await owner(ctx, "set-audience", { itemId: "F01", audience: "selected", teachers: [OMAR] });
    expect(await bankOf(ctx, ctx.sara)).not.toContain("F01");
    await owner(ctx, "set-audience", { itemId: "F01", audience: "all" });
    expect(await bankOf(ctx, ctx.sara)).toContain("F01");
    expect(audits(ctx).map(a => [a.action, a.targetId, a.details.audience, a.details.added, a.details.removed])).toEqual([
      ["owner.library.audience-set", "F01", "selected", [SARA, OMAR].sort(), []],
      ["owner.library.audience-set", "F01", "selected", [], [SARA]],
      ["owner.library.audience-set", "F01", "all", [], [OMAR]]
    ]);
  });
});

describe("P6-D one teacher's bank", () => {
  let ctx;
  beforeEach(async () => { ctx = setup(); await owner(ctx, "set-audience", { itemId: "T07", audience: "selected", teachers: [] }); });
  it("the owner adds exams to a teacher's bank later, and removes them", async () => {
    expect(await bankOf(ctx, ctx.omar)).not.toContain("T07");
    const add = await owner(ctx, "set-teacher", { accountId: OMAR, include: ["T07"] });
    expect([add.status, add.jsonBody.added, add.jsonBody.removed]).toEqual([200, ["T07"], []]);
    expect(await bankOf(ctx, ctx.omar)).toContain("T07");
    expect(await bankOf(ctx, ctx.sara)).not.toContain("T07");
    const rm = await owner(ctx, "set-teacher", { accountId: OMAR, exclude: ["T07"] });
    expect(rm.jsonBody.removed).toEqual(["T07"]);
    expect(await bankOf(ctx, ctx.omar)).not.toContain("T07");
  });
  it("an exam «for all teachers» cannot be removed for one teacher: the whole request is refused, nothing written", async () => {
    const before = JSON.stringify(ctx.mem.getJson(LA.AUDIENCE_DOC));
    const r = await owner(ctx, "set-teacher", { accountId: OMAR, include: ["T07"], exclude: ["F02"] });
    expect([r.status, r.jsonBody.code, r.jsonBody.items]).toEqual([409, "ITEM_FOR_ALL", ["F02"]]);
    expect(JSON.stringify(ctx.mem.getJson(LA.AUDIENCE_DOC))).toBe(before);
  });
});

describe("P6-D what never changes", () => {
  it("a published assignment is untouched when its exam leaves the teacher's bank", async () => {
    const ctx = setup();
    const a = await assign(ctx, ctx.sara, "cA", "T09");
    const name = "platform/assignments/" + a.jsonBody.assignment.assignmentId + ".json";
    const stored = JSON.stringify(ctx.mem.getJson(name));
    await owner(ctx, "set-audience", { itemId: "T09", audience: "selected", teachers: [OMAR] });
    expect(await bankOf(ctx, ctx.sara)).not.toContain("T09");
    expect(JSON.stringify(ctx.mem.getJson(name))).toBe(stored);
  });
  it("before enforcement (legacy / observe), and for identities that predate the console, the whole library as today", async () => {
    for (const mode of ["legacy", "observe"]) {
      const ctx = setup({ mode });
      await owner(ctx, "set-audience", { itemId: "T05", audience: "selected", teachers: [] });
      expect(await bankOf(ctx, ctx.sara)).toEqual(ALL36);
    }
    // the shared-password identity exists only while no owner does (P2-B), so: a workspace without an owner, the record written directly
    const ctx = setup();
    ctx.mem.store.delete(BOOTSTRAP_MARKER);
    resetOperatorGateCache();
    await LA.mutateAudience(ctx.mem.container, doc => { doc.items.T05 = { audience: "selected", teachers: [], updatedAt: "x", updatedBy: "owner:x" }; });
    expect(await bankOf(ctx, { "x-builder-token": createBuilderToken("teacher") })).toEqual(ALL36);
    expect(await bankOf(ctx, ctx.sara)).not.toContain("T05");
  });
  it("a catalog narrowed differently has its own ETag; a revalidation answers 304 only for the same list", async () => {
    const ctx = setup();
    await owner(ctx, "set-audience", { itemId: "T05", audience: "selected", teachers: [SARA] });
    const s = await catalog(ctx, ctx.sara), o = await catalog(ctx, ctx.omar);
    expect(s.headers.ETag).not.toBe(o.headers.ETag);
    expect((await catalog(ctx, ctx.omar, { "if-none-match": o.headers.ETag })).status).toBe(304);
    expect((await catalog(ctx, ctx.omar, { "if-none-match": s.headers.ETag })).status).toBe(200);
  });
  it("an audience record that cannot be understood fails closed: teachers 503, the owner 503, nothing overwritten", async () => {
    const ctx = setup();
    ctx.mem.setJson(LA.AUDIENCE_DOC, { schemaVersion: 1, items: { T05: { audience: "everyone", teachers: [] } } });
    const before = JSON.stringify(ctx.mem.getJson(LA.AUDIENCE_DOC));
    expect([(await catalog(ctx, ctx.sara)).status, (await item(ctx, ctx.sara, "F01")).status, (await assign(ctx, ctx.sara, "cA", "F01")).status]).toEqual([503, 503, 503]);
    expect((await ownerGet(ctx)).status).toBe(503);
    expect((await owner(ctx, "set-audience", { itemId: "F01", audience: "all" })).status).toBe(503);
    expect(JSON.stringify(ctx.mem.getJson(LA.AUDIENCE_DOC))).toBe(before);
    expect(ctx.mem.names("platform/assignments/")).toEqual([]);
  });
});

describe("P6-D the owner route", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });
  it("owner only; every change needs a recent step-up; nothing written without it", async () => {
    expect((await ownerGet(ctx, {})).status).toBe(401);
    expect((await ownerGet(ctx, ctx.sara)).status).toBe(401);
    const stale = await owner(ctx, "set-audience", { itemId: "F01", audience: "all" }, ctx.ownerStale);
    expect([stale.status, stale.jsonBody.code]).toEqual([403, "STEP_UP_REQUIRED"]);
    expect(ctx.mem.getJson(LA.AUDIENCE_DOC)).toBeNull();
  });
  it("lists every exam with its audience and every teacher", async () => {
    await owner(ctx, "set-audience", { itemId: "T05", audience: "selected", teachers: [SARA] });
    const r = await ownerGet(ctx);
    expect(r.jsonBody.items).toHaveLength(36);
    expect(r.jsonBody.items.find(i => i.libraryItemId === "T05")).toMatchObject({ audience: "selected", teachers: [SARA], decided: true });
    expect(r.jsonBody.items.find(i => i.libraryItemId === "F01")).toMatchObject({ audience: "all", teachers: [], decided: true, title: expect.any(String) });
    expect(r.jsonBody.teachers.map(t => t.accountId).sort()).toEqual([SARA, OMAR].sort());
  });
  it("unknown exams or teachers and malformed requests are refused; nothing written, nothing audited", async () => {
    const cases = [
      ["set-audience", { itemId: "NOPE", audience: "all" }, "LIBRARY_ITEM_NOT_FOUND"],
      ["set-audience", { itemId: "../x", audience: "all" }, "LIBRARY_ITEM_NOT_FOUND"],
      ["set-audience", { itemId: "F01", audience: "everyone" }, "AUDIENCE_INVALID"],
      ["set-audience", { itemId: "F01", audience: "selected", teachers: ["t_ffffffffffffffff"] }, "TEACHER_NOT_FOUND"],
      ["set-audience", { itemId: "F01", audience: "selected", teachers: "x" }, "TEACHERS_INVALID"],
      ["set-teacher", { accountId: "t_ffffffffffffffff", include: ["F01"] }, "TEACHER_NOT_FOUND"],
      ["set-teacher", { accountId: SARA, include: ["NOPE"] }, "LIBRARY_ITEM_NOT_FOUND"],
      ["set-teacher", { accountId: SARA, include: ["T05"], exclude: ["T05"] }, "ITEMS_INVALID"]
    ];
    for (const [action, body, code] of cases) expect([action, (await owner(ctx, action, body)).jsonBody.code]).toEqual([action, code]);
    expect(ctx.mem.getJson(LA.AUDIENCE_DOC)).toBeNull();
    expect(audits(ctx)).toEqual([]);
  });
});
