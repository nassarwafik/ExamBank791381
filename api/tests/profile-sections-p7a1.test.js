import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";
import { school, NOW, SUB, instrument } from "./fixtures/analytics-school.js";

// Tadris+ P7-A1 — the student profile (GET /api/students?profileUserId=, gated by students.student.view) carries the student's
// assignment history, grades and average: assignment data, served now only with assignments.assignment.view (while the owner
// enforces access). FAIL-FIRST: on the baseline a learning-only teacher received the grades. The profile itself, the learning
// progress and the recognition stay. TEST data only.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p7a1-profile-sections-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: students } = await import("../src/functions/manage-students.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa";
function setup({ mode = "enforce", preset = "learning-only", version = 1 } = {}) {
  resetRevisionCache(); resetOperatorGateCache();
  const seed = school();
  for (const c of ["c1", "c2", "c3"]) seed["platform/classes/" + c + ".json"].ownerId = SARA;
  const mem = createMemoryContainer(seed);
  const { revision } = buildRevision({ accountId: SARA, presetId: preset, presetVersion: version, createdBy: "owner:x" });
  mem.setJson(revisionName(revision.revisionId), revision);
  mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: preset, version } });
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  const token = recordedManagedToken(mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token;
  return { mem, token, deps: { getContainer: () => mem.container, container: mem.container } };
}
const profileOf = async ctx => students({ method: "GET", url: "https://x/api/students?profileUserId=s01", headers: { get: k => (String(k).toLowerCase() === "x-builder-token" ? ctx.token : null) } }, ctx.deps);

describe("P7-A1 fail-first — the student profile of a learning-only teacher (enforce) carries no assignment grade", () => {
  it("no assignment history, no submitted results, no average; the student and the class stay", async () => {
    const r = await profileOf(setup());
    expect(r.status).toBe(200);
    const p = r.jsonBody.profile;
    expect(p.student.userId).toBe("s01");
    expect(p.classroom.classId).toBe("c1");
    expect(p.assignments).toEqual([]);
    expect(p.submittedAssignments).toEqual([]);
    expect(p.stats).toMatchObject({ assigned: 0, completed: 0, pending: 0, average: null });
    expect(p.withheld).toEqual(["assignments"]);
  });
});

describe("P7-A1 — the student profile", () => {
  it("learning-only: no assignment document or submission is read", async () => {
    const ctx = setup();
    const st = instrument(ctx.mem);
    await profileOf(ctx);
    expect(st.lists.filter(p => p.startsWith("platform/assignments/") || p.startsWith(SUB))).toEqual([]);
    expect(st.subs()).toEqual([]);
  });

  it("full-teaching, and every mode before enforcement: the grades as before", async () => {
    for (const ctx of [setup({ preset: "full-teaching", version: 2 }), setup({ mode: "observe" }), setup({ mode: "legacy" })]) {
      const p = (await profileOf(ctx)).jsonBody.profile;
      expect(p.assignments.length).toBeGreaterThan(0);
      expect(p.submittedAssignments.length).toBeGreaterThan(0);
      expect(p.stats.average).not.toBeNull();
      expect(p.withheld).toEqual([]);
    }
  });

  it("enforce with an unreadable revision → 503, never the grades", async () => {
    const ctx = setup();
    ctx.mem.setJson(teacherAccountName(SARA), { ...ctx.mem.getJson(teacherAccountName(SARA)), accessRevisionId: "rev_missing_00000000000000" });
    resetRevisionCache();
    const r = await profileOf(ctx);
    expect(r.status).toBe(503);
    expect(r.jsonBody.profile).toBeUndefined();
  });
});

const rosterOf = async ctx => students({ method: "GET", url: "https://x/api/students?classId=c1", headers: { get: k => (String(k).toLowerCase() === "x-builder-token" ? ctx.token : null) } }, ctx.deps);
describe("P7-A1 — the roster's submitted-assignments count", () => {
  it("learning-only: every count is 0 and no submission is read; the roster itself is complete", async () => {
    const ctx = setup();
    const st = instrument(ctx.mem);
    const r = await rosterOf(ctx);
    expect(r.status).toBe(200);
    expect(r.jsonBody.students.map(x => x.userId).sort()).toEqual(["s01", "s02", "s03", "s04"]);
    expect(r.jsonBody.students.every(x => x.submittedAssignmentsCount === 0)).toBe(true);
    expect(st.lists.filter(p => p.startsWith(SUB))).toEqual([]);
  });
  it("full-teaching: the counts as before", async () => {
    const r = await rosterOf(setup({ preset: "full-teaching", version: 2 }));
    expect(r.jsonBody.students.find(x => x.userId === "s01").submittedAssignmentsCount).toBeGreaterThan(0);
  });
});
void NOW;
