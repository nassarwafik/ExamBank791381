import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// requireCapability loads its libraries with require(): reset THOSE instances (an ESM import is a separate module instance here).
const cjs = createRequire(import.meta.url);

// Tadris+ P3-B — every teacher route declares its capability (blueprint §4.4 rule 5) and asks for it. CI fails when:
//   a teacher route is neither declared nor exempt · a declared route does not call requireCapability with its own file name ·
//   a declared capability is unknown or owner-only · a declaration names a route that does not exist.
// Plus the behaviour of requireCapability itself (TEST data only): only managed sessions are evaluated; legacy mode and observe
// never block; an observed «would deny» is recorded for the owner; and the legacy-full equivalence that lets the other sessions skip.

process.env.BANK_SETUP_KEY = "p3b-routes-root-secret";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_SESSION_VERSION;

const { ROUTE_CAPABILITIES, EXEMPT, capabilityFor } = await import("../src/lib/access/route-capabilities.js");
const { isCapability, isOwnerOnly, TEACHER_CAPABILITIES } = await import("../src/lib/access/capabilities.js");
const { preset } = await import("../src/lib/access/presets.js");
const { requireCapability } = await import("../src/lib/access/require-capability.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { buildRevision, writeRevision, resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { observationName, resetObservationThrottle } = cjs("../src/lib/access/observations.js");

const FUNCTIONS = join(import.meta.dirname, "..", "src", "functions");
const source = f => readFileSync(join(FUNCTIONS, f), "utf8");
const teacherRoutes = readdirSync(FUNCTIONS).filter(f => f.endsWith(".js") && /requireTeacherSession/.test(source(f))).sort();

describe("P3-B route-capability registry", () => {
  it("every teacher route is declared or exempt — exactly once", () => {
    const declared = Object.keys(ROUTE_CAPABILITIES), exempt = Object.keys(EXEMPT);
    expect(declared.filter(f => exempt.includes(f))).toEqual([]);
    expect([...declared, ...exempt].sort()).toEqual(teacherRoutes);
  });
  it("every declared route asks requireCapability with its own file name; an exempt route never does", () => {
    for (const f of Object.keys(ROUTE_CAPABILITIES)) {
      const src = source(f);
      expect({ f, imports: /require\("\.\.\/lib\/access\/require-capability"\)/.test(src) }).toEqual({ f, imports: true });
      const files = [...src.matchAll(/requireCapability\(\s*\w+\s*,\s*"([^"]+)"/g)].map(m => m[1]);
      expect({ f, asks: files.length > 0 && files.every(x => x === f) }).toEqual({ f, asks: true });
      // Every call's result is acted on (returned when it denies).
      const calls = (src.match(/requireCapability\(/g) || []).length;
      const returns = (src.match(/if\s*\(\s*capabilityDenial\s*\)\s*return/g) || []).length;
      expect({ f, everyCallActedOn: returns === calls }).toEqual({ f, everyCallActedOn: true });
    }
    for (const f of Object.keys(EXEMPT)) expect({ f, asks: /requireCapability\(/.test(source(f)) }).toEqual({ f, asks: false });
  });
  it("every declared capability is a known TEACHER capability; every route has a fallback", () => {
    for (const [f, map] of Object.entries(ROUTE_CAPABILITIES)) {
      expect({ f, fallback: Boolean(map["*"]) }).toEqual({ f, fallback: true });
      for (const [key, v] of Object.entries(map)) for (const c of Array.isArray(v) ? v : [v]) {
        expect({ f, key, c, known: isCapability(c), ownerOnly: isOwnerOnly(c) }).toEqual({ f, key, c, known: true, ownerOnly: false });
      }
    }
  });
  it("the skip for non-managed sessions is exact: legacy-full holds every capability any route can ask for", () => {
    const asked = new Set(Object.values(ROUTE_CAPABILITIES).flatMap(m => Object.values(m).flatMap(v => (Array.isArray(v) ? v : [v]))));
    const full = new Set(preset("legacy-full", 1).capabilities);
    expect([...asked].filter(c => !full.has(c))).toEqual([]);
    expect([...full].sort()).toEqual([...TEACHER_CAPABILITIES].sort());
  });
  it("owner decision D18 at the route level: create class, permanent delete, archive and restore are separate capabilities", () => {
    expect(capabilityFor("manage-classrooms.js", "create")).toBe("classes.class.create");
    expect(capabilityFor("manage-students.js", "archive")).toBe("students.student.archive");
    expect(capabilityFor("manage-students.js", "unarchive")).toBe("students.student.restore");
    expect(capabilityFor("manage-students.js", "delete")).toBe("students.student.delete");
    expect(capabilityFor("manage-students.js", "bulk:delete")).toBe("students.student.delete");
    expect(capabilityFor("manage-students.js", "bulk:archive")).toBe("students.student.archive");
    expect(() => capabilityFor("no-such-route.js", "x")).toThrow();
  });
});

describe("P3-B requireCapability", () => {
  const CONSOLE = "t_00112233445566aa";
  const managed = (accessRevisionId = null, sub = CONSOLE) => ({ ok: true, user: { ver: 3, role: "teacher", am: "managed", sub, accessRevisionId } });
  const down = () => { throw new Error("storage down"); };
  let mem;
  beforeEach(() => { mem = createMemoryContainer(); resetRevisionCache(); resetObservationThrottle(); });
  const mode = m => mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: m });

  it("a non-managed teacher session is not evaluated (no storage read at all)", async () => {
    for (const user of [{ ver: 2, role: "teacher", sub: "builder", am: "legacy" }, { ver: 2, role: "teacher", sub: "teacher-a", am: "multi-user" }, { sub: "stub" }]) {
      expect(await requireCapability({ ok: true, user }, "manage-students.js", "delete", { getContainer: down })).toBeNull();
    }
  });
  it("legacy mode (the default): allowed, even for an account the owner has not given access", async () => {
    expect(await requireCapability(managed(), "manage-students.js", "delete", { container: mem.container })).toBeNull();
  });
  it("observe: allowed, and the «would deny» is recorded once per teacher and capability for the owner to review", async () => {
    mode("observe");
    const logs = [];
    const obs = { logWarn: (event, fields) => logs.push({ event, ...fields }) };
    for (let i = 0; i < 3; i++) expect(await requireCapability(managed(), "manage-students.js", "delete", { container: mem.container }, obs)).toBeNull();
    expect(logs.filter(l => l.event === "access.observe.would_deny")).toHaveLength(3);
    const doc = mem.getJson(observationName(CONSOLE));
    expect(doc).toMatchObject({ schemaVersion: 1, accountId: CONSOLE });
    expect(doc.capabilities["students.student.delete"]).toMatchObject({ count: 1 });
    expect(Object.keys(doc.capabilities)).toEqual(["students.student.delete"]);
  });
  it("observe: a granted capability records nothing", async () => {
    mode("observe");
    const { revision } = buildRevision({ accountId: CONSOLE, presetId: "full-teaching", presetVersion: 1, createdBy: "owner:x" });
    await writeRevision(mem.container, revision);
    expect(await requireCapability(managed(revision.revisionId), "manage-students.js", "archive", { container: mem.container })).toBeNull();
    expect(mem.has(observationName(CONSOLE))).toBe(false);
  });
  it("a recording failure never changes the answer (observe stays non-blocking)", async () => {
    mode("observe");
    let attempts = 0;
    const flaky = new Proxy(mem.container, { get(t, p) { if (p === "getBlockBlobClient") return () => ({ upload: async () => { attempts++; throw new Error("write down"); } }); const v = t[p]; return typeof v === "function" ? v.bind(t) : v; } });
    expect(await requireCapability(managed(), "manage-students.js", "delete", { container: flaky })).toBeNull();
    expect(attempts).toBeGreaterThan(0);                                         // the recording WAS attempted, and failed
  });
  it("enforce (not settable by the owner in P3-B1, but already honoured): not granted → 403; granted → allowed", async () => {
    mode("enforce");
    const r = await requireCapability(managed(), "manage-students.js", "delete", { container: mem.container });
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("CAPABILITY_DENIED");
    const { revision } = buildRevision({ accountId: CONSOLE, presetId: "full-teaching", presetVersion: 1, createdBy: "owner:x" });
    await writeRevision(mem.container, revision);
    expect(await requireCapability(managed(revision.revisionId), "manage-students.js", "archive", { container: mem.container })).toBeNull();
    expect((await requireCapability(managed(revision.revisionId), "manage-students.js", "delete", { container: mem.container })).status).toBe(403);
  });
  it("an any-of declaration passes with ONE of its capabilities (a reviewer reads the governance inbox)", async () => {
    mode("enforce");
    const { revision } = buildRevision({ accountId: CONSOLE, presetId: "learning-only", presetVersion: 1, grants: ["examGovernance.exam.review"], createdBy: "owner:x" });
    await writeRevision(mem.container, revision);
    expect(await requireCapability(managed(revision.revisionId), "governance-inbox.js", "*", { container: mem.container })).toBeNull();
    expect((await requireCapability(managed(revision.revisionId), "exam-governance.js", "approve", { container: mem.container })).status).toBe(403);
  });
  it("an undeclared route or an owner-only capability is a programming error", async () => {
    await expect(requireCapability(managed(), "nope.js", "x", { container: mem.container })).rejects.toThrow();
  });
});
