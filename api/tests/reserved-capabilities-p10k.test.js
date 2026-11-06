import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";

// Tadris+ P10-K — the six capabilities no route enforces are RESERVED (closes security review O11; design
// docs/enterprise-reserved-capabilities-p10k.md, owner decision §19.48: «الست محجوزة»). The console marks them and the server
// refuses a NEW grant or deny of one: a choice that changes nothing must not look like one. An entry inherited from the teacher's
// current revision stays, removing it is accepted, a rollback copies a stored revision as it is, a deny FORCED by a dependency is
// accepted, and reading a stored revision never changes — so no teacher is ever blocked by this phase. Real handlers, a real owner
// session with a recent step-up, test data only.

process.env.BANK_SETUP_KEY = "p10k-reserved-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: ownerAccess } = await import("../src/functions/owner-access.js");
const { handler: ownerTeachers } = await import("../src/functions/owner-teachers.js");
const { handler: platformSession } = await import("../src/functions/platform-session.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { resetOperatorGateCache } = await import("../src/lib/identity/operator-gate.js");
const { buildRevision, revisionName, resetRevisionCache, REVISION_PREFIX } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { CAPABILITIES } = await import("../src/lib/access/capabilities.js");

const OWNER_ID = "own_0011223344556677";
const SARA = "t_00112233445566aa";
const SIX = ["examBuilder.exam.publish", "examLibrary.item.assign", "examLibrary.item.copy", "games.results.view", "messages.history.view", "reports.export.use"];

function req({ method = "POST", action = "", body = {}, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: { action }, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}

/** An owner with a fresh step-up, and the teacher Sara — optionally already on a stored revision (`current`). */
function setup({ current = null, mode = "enforce" } = {}) {
  resetOperatorGateCache(); resetRevisionCache();
  const mem = createMemoryContainer();
  const now = Date.now();
  const account = { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] };
  if (current) {
    const { revision } = buildRevision({ accountId: SARA, createdBy: "owner:" + OWNER_ID, ...current });
    mem.setJson(revisionName(revision.revisionId), revision);
    account.accessRevisionId = revision.revisionId;
    account.accessPreset = { id: current.presetId, version: current.presetVersion };
  }
  mem.setJson(teacherAccountName(SARA), account);
  mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const sid = "c".repeat(32);
  mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now });
  const owner = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  const deps = { getContainer: () => mem.container };
  const assign = body => ownerAccess(req({ action: "assign", headers: owner, body: { accountId: SARA, ...body } }), deps);
  const revisions = () => mem.names(REVISION_PREFIX).length;
  const pointer = () => mem.getJson(teacherAccountName(SARA)).accessRevisionId || null;
  return { mem, deps, owner, assign, revisions, pointer, current: account.accessRevisionId || null };
}
const reserved = (r, cap) => r.status === 400 && r.jsonBody && r.jsonBody.code === "CAPABILITY_RESERVED" && (!cap || (r.jsonBody.details && r.jsonBody.details.capabilities.includes(cap)));

describe("P10-K fail-first: a choice that changes nothing is no longer offered as one (O11)", () => {
  it("the registry the console reads marks exactly the six capabilities no route enforces as reserved, each with its reason", async () => {
    const ctx = setup();
    const r = await ownerAccess(req({ method: "GET", headers: ctx.owner }), ctx.deps);
    expect(r.status).toBe(200);
    const marked = r.jsonBody.capabilities.filter(c => c.reserved === true);
    expect(marked.map(c => c.id).sort()).toEqual(SIX);
    for (const c of marked) expect(typeof c.reservedNote === "string" && c.reservedNote.length > 5, c.id).toBe(true);
    expect(r.jsonBody.capabilities.find(c => c.id === "assignments.ready.assign").reserved).toBe(false);
  });

  it("a NEW deny of «تصدير التقارير» is refused 400 CAPABILITY_RESERVED and nothing is written (baseline: 200, a revision with no effect)", async () => {
    const ctx = setup({ current: { presetId: "full-teaching", presetVersion: 2 } });
    const before = { revisions: ctx.revisions(), pointer: ctx.pointer() };
    const r = await ctx.assign({ presetId: "full-teaching", presetVersion: 2, denies: ["reports.export.use"], baseRevisionId: ctx.current });
    expect(r.status + " " + (r.jsonBody && r.jsonBody.code)).toBe("400 CAPABILITY_RESERVED");
    expect(r.jsonBody.details.capabilities).toEqual(["reports.export.use"]);
    expect({ revisions: ctx.revisions(), pointer: ctx.pointer() }).toEqual(before);
  });

  it("a NEW grant of «نتائج الألعاب» to a learning-only teacher is refused the same way (baseline: 200)", async () => {
    const ctx = setup({ current: { presetId: "learning-only", presetVersion: 1 } });
    const r = await ctx.assign({ presetId: "learning-only", presetVersion: 1, grants: ["games.results.view"], baseRevisionId: ctx.current });
    expect(reserved(r, "games.results.view")).toBe(true);
  });

  it("creating a teacher with a reserved grant is refused, and no account is created (baseline: created)", async () => {
    const ctx = setup();
    const r = await ownerTeachers(req({ action: "create", headers: ctx.owner, body: { username: "t.huda", displayName: "هدى", presetId: "learning-only", presetVersion: 1, grants: ["messages.history.view"] } }), ctx.deps);
    expect(reserved(r, "messages.history.view")).toBe(true);
    expect(ctx.mem.names("platform/identity/teachers/").filter(n => !n.endsWith(SARA + ".json") && /t_[0-9a-f]{16}\.json$/.test(n))).toEqual([]);
  });
});

describe("P10-K nothing that exists is broken", () => {
  it("an entry inherited from the current revision is kept when the owner changes something else; removing it is accepted", async () => {
    const ctx = setup({ mode: "observe" });
    // A revision saved before P10-K (the guard did not exist): written straight to the store, exactly as it was then.
    const { revision } = buildRevision({ accountId: SARA, presetId: "full-teaching", presetVersion: 2, denies: ["reports.export.use"], createdBy: "owner:" + OWNER_ID });
    ctx.mem.setJson(revisionName(revision.revisionId), revision);
    const acc = ctx.mem.getJson(teacherAccountName(SARA));
    ctx.mem.setJson(teacherAccountName(SARA), { ...acc, accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version: 2 } });
    const keep = await ctx.assign({ presetId: "full-teaching", presetVersion: 2, denies: ["reports.export.use", "reports.ai.use"], baseRevisionId: revision.revisionId });
    expect(keep.status).toBe(200);
    const drop = await ctx.assign({ presetId: "full-teaching", presetVersion: 2, denies: ["reports.ai.use"], baseRevisionId: keep.jsonBody.access.revisionId });
    expect(drop.status).toBe(200);
    expect(drop.jsonBody.capabilities).toContain("reports.export.use");
  });

  it("a deny FORCED by a dependency is accepted: refusing exam creation also refuses library copy", async () => {
    const ctx = setup({ current: { presetId: "full-teaching", presetVersion: 2 } });
    const r = await ctx.assign({ presetId: "full-teaching", presetVersion: 2, denies: ["examBuilder.exam.create", "examLibrary.item.copy"], baseRevisionId: ctx.current });
    expect(r.status).toBe(200);
    expect(r.jsonBody.capabilities).not.toContain("examLibrary.item.copy");
  });

  it("a rollback copies a stored revision with a reserved entry as it is", async () => {
    const ctx = setup({ mode: "observe" });
    const { revision: old } = buildRevision({ accountId: SARA, presetId: "full-teaching", presetVersion: 2, denies: ["games.results.view"], createdBy: "owner:" + OWNER_ID, nowMs: Date.now() - 60000 });
    ctx.mem.setJson(revisionName(old.revisionId), old);
    const acc = ctx.mem.getJson(teacherAccountName(SARA));
    ctx.mem.setJson(teacherAccountName(SARA), { ...acc, accessRevisionId: old.revisionId, accessPreset: { id: "full-teaching", version: 2 } });
    const moved = await ctx.assign({ presetId: "full-teaching", presetVersion: 2, baseRevisionId: old.revisionId });
    expect(moved.status).toBe(200);
    const back = await ownerAccess(req({ action: "rollback", headers: ctx.owner, body: { accountId: SARA, revisionId: old.revisionId, baseRevisionId: moved.jsonBody.access.revisionId } }), ctx.deps);
    expect(back.status).toBe(200);
    expect(back.jsonBody.capabilities).not.toContain("games.results.view");
  });

  it("a stored revision with a reserved entry is read as valid: the teacher's session reports their access, never 'unavailable'", async () => {
    const ctx = setup({ current: { presetId: "full-teaching", presetVersion: 2, denies: ["examBuilder.exam.publish"] } });
    const token = recordedManagedToken(ctx.mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token;
    const r = await platformSession(req({ method: "GET", headers: { "x-builder-token": token } }), ctx.deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody.access.status).toBe("ok");
    expect(r.jsonBody.access.capabilities).toContain("assignments.ready.assign");
  });

  it("every capability that is not reserved is granted and denied exactly as before", async () => {
    const ctx = setup({ current: { presetId: "learning-only", presetVersion: 1 } });
    const r = await ctx.assign({ presetId: "learning-only", presetVersion: 1, grants: ["reports.ai.use", "reports.widget.view"], denies: ["learning.progress.view"], baseRevisionId: ctx.current });
    expect(r.status).toBe(200);
    expect(r.jsonBody.capabilities).toEqual(expect.arrayContaining(["reports.ai.use"]));
    expect(r.jsonBody.capabilities).not.toContain("learning.progress.view");
  });
});

describe("P10-K static guard: no capability is offered that the server never asks", () => {
  const API_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const files = [];
  (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".js") && !p.endsWith(".test.js")) files.push(p); } })(API_SRC);
  // The registry and the presets only LIST capabilities; everything else in the API is a place that asks one.
  const asking = files.filter(f => !/access[\\/](capabilities|presets)\.js$/.test(f)).map(f => readFileSync(f, "utf8")).join("\n");
  const named = id => asking.includes("\"" + id + "\"");

  it("every teacher capability is either asked somewhere in the API, or reserved — and a reserved one is asked nowhere", () => {
    const teacher = CAPABILITIES.filter(c => !c.ownerOnly);
    expect(teacher.filter(c => !c.reserved && !named(c.id)).map(c => c.id)).toEqual([]);
    expect(teacher.filter(c => c.reserved && named(c.id)).map(c => c.id)).toEqual([]);
    expect(teacher.filter(c => c.reserved).map(c => c.id).sort()).toEqual(SIX);
  });
});
