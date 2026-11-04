import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P3-A — the capability registry, presets, immutable access revisions, the resolver and authorize() (blueprint §4–§6).
// TEST data only. Nothing here is wired to a route yet (P3-B), so these are the library's guarantees:
//   default deny (an account without access gets none), platform.* never reaches a teacher, dependencies are refused on save
//   and on read (never corrected), every failure fails closed, legacy mode changes nothing, observe never blocks.

process.env.BANK_SETUP_KEY = "p3a-registry-root-secret";
process.env.BUILDER_PASSWORD = "shared";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_SESSION_VERSION;

const { CAPABILITIES, TEACHER_CAPABILITIES, NAME_RE, isCapability, unmetDependencies } = await import("../src/lib/access/capabilities.js");
const { PRESETS, preset, presetProblems } = await import("../src/lib/access/presets.js");
const { evaluateRevision, buildRevision, writeRevision, readRevision, resetRevisionCache, revisionName, REVISION_ID_RE } = await import("../src/lib/access/revisions.js");
const { resolveTeacherAccess } = await import("../src/lib/access/resolver.js");
const { authorize } = await import("../src/lib/access/authorize.js");
const { ACCESS_CONTROL_DOC, readAccessMode, writeAccessMode } = await import("../src/lib/access/access-mode.js");

const CONSOLE = "t_00112233445566aa";
const rev = over => ({ schemaVersion: 1, revisionId: "ar_000000001_0011223344556677", accountId: CONSOLE, parentRevisionId: null, preset: { id: "learning-only", version: 1 }, grants: [], denies: [], resources: {}, reason: "", createdAt: "x", createdBy: "owner:x", ...over });
const managed = (sub, accessRevisionId = null) => ({ ver: 3, role: "teacher", am: "managed", sub, accessRevisionId });
const down = () => { throw new Error("storage down"); };
const logs = () => { const out = []; return { out, obs: { logWarn: (event, fields) => out.push({ event, ...fields }) } }; };

beforeEach(() => resetRevisionCache());

describe("P3-A capability registry v1", () => {
  it("names follow <module>.<resource>.<action>, are unique, and every dependency is a known capability", () => {
    expect(new Set(CAPABILITIES.map(c => c.id)).size).toBe(CAPABILITIES.length);
    for (const c of CAPABILITIES) {
      expect(c.id, c.id).toMatch(NAME_RE);
      expect(c.label.length, c.id).toBeGreaterThan(0);
      for (const r of c.requires) expect(isCapability(r), c.id + " → " + r).toBe(true);
    }
    expect(unmetDependencies(["examLibrary.item.copy"])).toEqual([{ capability: "examLibrary.item.copy", requires: "examBuilder.exam.create" }]);
    expect(unmetDependencies(["learning.module.release", "learning.course.assign"])).toEqual([]);
  });
  it("platform.* are owner-only and are never teacher capabilities", () => {
    const owner = CAPABILITIES.filter(c => c.ownerOnly).map(c => c.id);
    expect(owner.every(id => id.startsWith("platform."))).toBe(true);
    expect(owner).toHaveLength(8);
    expect(TEACHER_CAPABILITIES.some(id => id.startsWith("platform."))).toBe(false);
    expect(TEACHER_CAPABILITIES.length + owner.length).toBe(CAPABILITIES.length);
  });
  it("D18: the permanent deletion of a student is its own capability, separate from archive / restore", () => {
    for (const id of ["students.student.archive", "students.student.restore", "students.student.delete"]) expect(isCapability(id), id).toBe(true);
  });
});

describe("P3-A presets", () => {
  it("every preset uses known teacher capabilities only and meets every dependency", () => {
    expect(presetProblems()).toEqual([]);
    for (const p of PRESETS) expect(p.capabilities.some(c => c.startsWith("platform.")), p.id).toBe(false);
  });
  it("legacy-full is today's behaviour exactly: every teacher capability", () => {
    expect([...preset("legacy-full", 1).capabilities].sort()).toEqual([...TEACHER_CAPABILITIES].sort());
  });
  it("D18 (revised): the teaching presets do not create or manage classes and archive instead of deleting a student", () => {
    for (const id of ["full-teaching", "learning-ready-assignments", "learning-only"]) {
      const caps = preset(id, 1).capabilities;
      for (const c of ["classes.class.create", "classes.class.manage", "students.student.delete"]) expect(caps.includes(c), id + " " + c).toBe(false);
      for (const c of ["classes.class.view", "students.student.create", "students.student.edit", "students.student.archive", "students.student.restore"]) expect(caps.includes(c), id + " " + c).toBe(true);
    }
  });
  it("the three examples of the spec (§5.4)", () => {
    const has = (id, c) => preset(id, 1).capabilities.includes(c);
    expect(has("learning-only", "examBuilder.exam.create") || has("learning-only", "assignments.assignment.view") || has("learning-only", "messages.inbox.read")).toBe(false);
    expect(has("learning-ready-assignments", "assignments.ready.assign") && has("learning-ready-assignments", "messages.direct.send")).toBe(true);
    expect(has("learning-ready-assignments", "examBuilder.exam.create") || has("learning-ready-assignments", "examLibrary.item.viewKeys")).toBe(false);
    expect(has("full-teaching", "examBuilder.exam.create") && has("full-teaching", "examLibrary.item.viewKeys") && has("full-teaching", "assignments.assignment.create")).toBe(true);
  });
  it("an unknown preset or version does not exist", () => {
    expect(preset("legacy-full", 2)).toBeNull();
    expect(preset("admin", 1)).toBeNull();
  });
});

describe("P3-A revision validation — refused with its code, never corrected", () => {
  it("grants add, denies remove; the effective set is sorted", () => {
    const v = evaluateRevision(rev({ grants: ["messages.inbox.read"], denies: ["appearance.layout.choose"] }));
    expect(v.ok).toBe(true);
    expect(v.capabilities).toContain("messages.inbox.read");
    expect(v.capabilities).not.toContain("appearance.layout.choose");
    expect([...v.capabilities].sort()).toEqual(v.capabilities);
  });
  it.each([
    [{ preset: { id: "learning-only", version: 9 } }, "PRESET_UNKNOWN"],
    [{ preset: null }, "PRESET_UNKNOWN"],
    [{ grants: ["examBuilder.exam.fly"] }, "CAPABILITY_UNKNOWN"],
    [{ denies: ["nope"] }, "CAPABILITY_UNKNOWN"],
    [{ grants: "messages.inbox.read" }, "REVISION_MALFORMED"],
    [{ grants: ["messages.inbox.read", "messages.inbox.read"] }, "CAPABILITY_DUPLICATE"],
    [{ grants: ["platform.teachers.manage"] }, "PLATFORM_CAPABILITY_FORBIDDEN"],
    [{ grants: ["messages.inbox.read"], denies: ["messages.inbox.read"] }, "CAPABILITY_CONFLICT"],
    [{ denies: ["learning.course.assign"] }, "DEPENDENCY_UNMET"],
    [{ grants: ["examLibrary.item.copy"] }, "DEPENDENCY_UNMET"],
    // P5-A — `resources.courses` is now the course entitlement (an unknown course is refused); any OTHER resource key is still refused.
    [{ resources: { courses: ["x"] } }, "COURSE_UNKNOWN"],
    [{ resources: { projects: [] } }, "RESOURCES_NOT_SUPPORTED"]   // P7-B2 made `games` a known key: another unknown key keeps the rule
  ])("%j → %s", (over, code) => {
    const v = evaluateRevision(rev(over));
    expect(v.ok).toBe(false);
    expect(v.code).toBe(code);
  });
  it("buildRevision: a sortable unique id, the parent recorded, refusals thrown", () => {
    const a = buildRevision({ accountId: CONSOLE, presetId: "full-teaching", presetVersion: 1, createdBy: "owner:x", nowMs: 1_800_000_000_000 });
    const b = buildRevision({ accountId: CONSOLE, parentRevisionId: a.revision.revisionId, presetId: "full-teaching", presetVersion: 1, createdBy: "owner:x", nowMs: 1_800_000_000_001 });
    expect(a.revision.revisionId).toMatch(REVISION_ID_RE);
    expect(a.revision.revisionId < b.revision.revisionId).toBe(true);
    expect(b.revision.parentRevisionId).toBe(a.revision.revisionId);
    expect(() => buildRevision({ accountId: CONSOLE, presetId: "full-teaching", presetVersion: 1, grants: ["platform.operations.run"] })).toThrow("PLATFORM_CAPABILITY_FORBIDDEN");
  });
});

describe("P3-A revision storage — immutable, validated on read, cached only when valid", () => {
  it("create-only: the same revision id cannot be written twice", async () => {
    const mem = createMemoryContainer();
    const { revision } = buildRevision({ accountId: CONSOLE, presetId: "learning-only", presetVersion: 1, createdBy: "owner:x" });
    await writeRevision(mem.container, revision);
    await expect(writeRevision(mem.container, { ...revision, grants: ["messages.inbox.read"] })).rejects.toThrow("REVISION_EXISTS");
    expect(mem.getJson(revisionName(revision.revisionId)).grants).toEqual([]);
  });
  it("a missing, foreign or tampered revision is refused; a valid one is cached (a later outage does not matter)", async () => {
    const mem = createMemoryContainer();
    const { revision } = buildRevision({ accountId: CONSOLE, presetId: "learning-only", presetVersion: 1, createdBy: "owner:x" });
    await expect(readRevision(mem.container, revision.revisionId, CONSOLE)).rejects.toThrow("REVISION_MISSING");
    mem.setJson(revisionName(revision.revisionId), { ...revision, grants: ["platform.operations.run"] });
    await expect(readRevision(mem.container, revision.revisionId, CONSOLE)).rejects.toThrow("REVISION_INVALID");
    mem.setJson(revisionName(revision.revisionId), revision);
    await expect(readRevision(mem.container, revision.revisionId, "t_99887766554433aa")).rejects.toThrow("REVISION_INVALID");
    const entry = await readRevision(mem.container, revision.revisionId, CONSOLE);
    expect(entry.capabilities).toEqual([...preset("learning-only", 1).capabilities].sort());
    const again = await readRevision({ getBlobClient: down }, revision.revisionId, CONSOLE);
    expect(again.capabilities).toEqual(entry.capabilities);
    await expect(readRevision({ getBlobClient: down }, revision.revisionId, "t_99887766554433aa")).rejects.toThrow("REVISION_INVALID");
  });
  it("a storage error propagates (the caller fails closed)", async () => {
    await expect(readRevision({ getBlobClient: () => ({ download: async () => { const e = new Error("down"); e.statusCode = 500; throw e; } }) }, "ar_000000001_0011223344556677", CONSOLE)).rejects.toThrow("down");
  });
});

describe("P3-A resolver", () => {
  it("shared-password and BUILDER_USERS sessions → legacy-full (today's behaviour, D7)", async () => {
    for (const [user, source] of [[{ ver: 2, role: "teacher", sub: "builder", am: "legacy" }, "shared-password"], [{ ver: 2, role: "teacher", sub: "teacher-a", am: "multi-user" }, "migrated-default"]]) {
      const a = await resolveTeacherAccess(user, { getContainer: down });
      expect(a.source).toBe(source);
      expect(a.preset).toEqual({ id: "legacy-full", version: 1 });
      expect(a.capabilities).toEqual([...TEACHER_CAPABILITIES].sort());
    }
  });
  it("default deny: a console account the owner has not given access to holds NOTHING", async () => {
    // P5-A added `courses` (the course entitlement): null = no narrowing (owner decisions §19.13). Capabilities: still none.
    // P7-A2 added `widgets` (the dashboard-widget entitlement), the same rule: null = no narrowing. P7-B2 added `games`, likewise.
    expect(await resolveTeacherAccess(managed(CONSOLE), { getContainer: down })).toEqual({ source: "unassigned", revisionId: null, preset: null, capabilities: [], courses: null, widgets: null, games: null });
  });
  it("the imported shared-password workspace (t_legacy) keeps today's access until the owner assigns one", async () => {
    const a = await resolveTeacherAccess(managed("t_legacy"), { getContainer: down });
    expect(a.source).toBe("migrated-default");
    expect(a.preset.id).toBe("legacy-full");
  });
  it("a managed account with a revision gets exactly that revision; a revision problem or storage error is thrown", async () => {
    const mem = createMemoryContainer();
    const { revision } = buildRevision({ accountId: CONSOLE, presetId: "learning-only", presetVersion: 1, grants: ["messages.inbox.read"], createdBy: "owner:x" });
    await writeRevision(mem.container, revision);
    const a = await resolveTeacherAccess(managed(CONSOLE, revision.revisionId), { getContainer: () => mem.container });
    expect(a).toMatchObject({ source: "revision", revisionId: revision.revisionId, preset: { id: "learning-only", version: 1 } });
    expect(a.capabilities).toContain("messages.inbox.read");
    expect(a.capabilities.some(c => c.startsWith("platform."))).toBe(false);
    await expect(resolveTeacherAccess(managed(CONSOLE, "ar_000000009_ffffffffffffffff"), { getContainer: () => mem.container })).rejects.toThrow("REVISION_MISSING");
    resetRevisionCache();
    await expect(resolveTeacherAccess(managed(CONSOLE, revision.revisionId), { getContainer: down })).rejects.toThrow("storage down");
  });
  it("an identity it cannot classify is refused (never full access)", async () => {
    for (const u of [null, {}, { sub: "x" }, { sub: "x", am: "student" }, { ver: 3, am: "managed" }]) await expect(resolveTeacherAccess(u, {})).rejects.toThrow("PRINCIPAL_UNKNOWN");
  });
});

describe("P3-A rollout mode", () => {
  it("absent → legacy; observe can be set; enforce cannot be set yet; a malformed document is an error, never legacy", async () => {
    const mem = createMemoryContainer();
    expect((await readAccessMode(mem.container)).mode).toBe("legacy");
    expect(await writeAccessMode(mem.container, "observe", "owner:x")).toMatchObject({ mode: "observe", previous: "legacy" });
    expect((await readAccessMode(mem.container)).mode).toBe("observe");
    await expect(writeAccessMode(mem.container, "enforce", "owner:x")).rejects.toThrow("ACCESS_MODE_NOT_SETTABLE");
    await expect(writeAccessMode(mem.container, "off", "owner:x")).rejects.toThrow("ACCESS_MODE_NOT_SETTABLE");
    mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "everything" });
    await expect(readAccessMode(mem.container)).rejects.toThrow("ACCESS_MODE_INVALID");
  });
});

describe("P3-A authorize()", () => {
  const withMode = mode => { const mem = createMemoryContainer(); if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode }); return mem; };
  const unassigned = managed(CONSOLE);

  it("an unknown capability is a programming error", async () => {
    await expect(authorize(unassigned, "examBuilder.exam.fly", { container: withMode().container })).rejects.toThrow("unknown capability");
  });
  it("platform.* is refused for a teacher in every mode — even legacy, even with storage down", async () => {
    for (const deps of [{ container: withMode().container }, { container: withMode("observe").container }, { getContainer: down }]) {
      const r = await authorize({ ver: 2, role: "teacher", sub: "builder", am: "legacy" }, "platform.operations.run", deps);
      expect(r.allowed).toBe(false);
      expect(r.response.status).toBe(403);
    }
  });
  it("legacy (the default): allowed without evaluating — today's behaviour, even for an account with no access", async () => {
    const r = await authorize(unassigned, "examBuilder.exam.create", { container: withMode().container });
    expect(r).toEqual({ allowed: true, mode: "legacy", decision: "not-evaluated" });
  });
  it("observe: a missing capability is logged as «would deny» and ALLOWED; a resolution failure is logged and allowed", async () => {
    const { out, obs } = logs();
    const r = await authorize(unassigned, "examBuilder.exam.create", { container: withMode("observe").container }, obs);
    expect(r).toMatchObject({ allowed: true, mode: "observe", decision: "would-deny" });
    expect(out).toEqual([{ event: "access.observe.would_deny", capability: "examBuilder.exam.create", source: "unassigned", preset: "none" }]);
    const bad = await authorize(managed(CONSOLE, "ar_000000009_ffffffffffffffff"), "examBuilder.exam.create", { container: withMode("observe").container }, obs);
    expect(bad).toMatchObject({ allowed: true, decision: "unavailable" });
    expect(out.at(-1)).toMatchObject({ event: "access.observe.unavailable", reason: "REVISION_MISSING" });
    const ok = await authorize({ ver: 2, role: "teacher", sub: "builder", am: "legacy" }, "examBuilder.exam.create", { container: withMode("observe").container }, obs);
    expect(ok).toMatchObject({ allowed: true, decision: "allow" });
  });
  it("enforce: not granted → 403 CAPABILITY_DENIED; cannot decide → 503; granted → allowed", async () => {
    const mem = withMode("enforce");
    const denied = await authorize(unassigned, "examBuilder.exam.create", { container: mem.container });
    expect(denied).toMatchObject({ allowed: false, decision: "deny" });
    expect(denied.response.status).toBe(403);
    expect(denied.response.jsonBody.code).toBe("CAPABILITY_DENIED");
    const broken = await authorize(managed(CONSOLE, "ar_000000009_ffffffffffffffff"), "examBuilder.exam.create", { container: mem.container });
    expect(broken.response.status).toBe(503);
    const { revision } = buildRevision({ accountId: CONSOLE, presetId: "full-teaching", presetVersion: 1, createdBy: "owner:x" });
    await writeRevision(mem.container, revision);
    expect(await authorize(managed(CONSOLE, revision.revisionId), "examBuilder.exam.create", { container: mem.container })).toMatchObject({ allowed: true, decision: "allow" });
    expect((await authorize(managed(CONSOLE, revision.revisionId), "classes.class.create", { container: mem.container })).allowed).toBe(false);
  });
  it("the mode cannot be read (storage down or a malformed document) → 503, never allowed", async () => {
    expect((await authorize(unassigned, "classes.class.view", { getContainer: down })).response.status).toBe(503);
    const mem = createMemoryContainer();
    mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "maybe" });
    const r = await authorize(unassigned, "classes.class.view", { container: mem.container });
    expect(r.allowed).toBe(false);
    expect(r.response.status).toBe(503);
  });
});
