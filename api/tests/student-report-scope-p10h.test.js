import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";
import { school, NOW, SUB, instrument } from "./fixtures/analytics-school.js";

// Tadris+ P10-H — the student report never reads another teacher's class (closes security review O13; design
// docs/enterprise-student-report-scope-p10h.md, owner decision §19.45). A student stamped as teacher A's (ownerId) passes the
// student check; the report then read the student's CURRENT class — its assignments, the student's results in them, its projects,
// its id, name and school year — without checking that class is A's. When it is another teacher's, the report now shows the student
// without class data (as a student with no class). TEST data only.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p10h-student-report-scope-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "STUDENT_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: reports } = await import("../src/functions/reports.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa";   // owns c1
const OMAR = "t_00112233445566bb";   // owns c2
const NOW_MS = Date.parse(NOW);

function setup() {
  resetRevisionCache(); resetOperatorGateCache();
  const seed = school();
  seed["platform/classes/c1.json"].ownerId = SARA;
  seed["platform/classes/c3.json"].ownerId = SARA;
  seed["platform/classes/c2.json"].ownerId = OMAR;
  // s11 sits in Omar's class c2 but carries Sara's owner stamp (the inconsistent state O13 is about).
  seed["platform/users/s11.json"].ownerId = SARA;
  const mem = createMemoryContainer(seed);
  for (const id of [SARA, OMAR]) {
    const { revision } = buildRevision({ accountId: id, presetId: "full-teaching", presetVersion: 2, grants: [], createdBy: "owner:x" });
    mem.setJson(revisionName(revision.revisionId), revision);
    mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username: "t." + id.slice(-2), displayName: "معلم", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version: 2 } });
  }
  mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "enforce" });
  const tokens = Object.fromEntries([SARA, OMAR].map(id => [id, recordedManagedToken(mem, { accountId: id, sid: newTeacherSessionId(), authVersion: 1 }).token]));
  const deps = { getContainer: () => mem.container, container: mem.container, nowMs: NOW_MS, docCache: null };
  return { mem, deps, tokens };
}
const as = (ctx, who, path) => reports({ method: "GET", url: "https://x" + path, headers: { get: k => (String(k).toLowerCase() === "x-builder-token" ? ctx.tokens[who] : null) } }, ctx.deps);

describe("P10-H the student report never reads another teacher's class (O13)", () => {
  it("fail-first: Sara's stamped student in Omar's class — no class id / name / school year, no assignments, no results", async () => {
    const ctx = setup();
    const st = instrument(ctx.mem);
    const r = await as(ctx, SARA, "/api/reports?type=student&studentId=s11");
    expect(r.status).toBe(200);
    expect(r.jsonBody.student).toMatchObject({ studentId: "s11", classId: "", className: "", schoolYear: "" });
    expect(r.jsonBody.academic).toMatchObject({ assessmentCount: 0, submittedCount: 0 });
    expect(r.jsonBody.projects).toEqual([]);
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/صف 2|"c2"|P3/);
    // nothing of Omar's class was read: no submission of s11 in Omar's assignment
    expect(st.downloads.filter(n => n.startsWith(SUB + "P3/"))).toEqual([]);
  });

  it("Omar, who owns the class, still sees the student's class data in full", async () => {
    const ctx = setup();
    const r = await as(ctx, OMAR, "/api/reports?type=student&studentId=s12");
    expect(r.status).toBe(200);
    expect(r.jsonBody.student).toMatchObject({ classId: "c2", className: "صف 2" });
    expect(r.jsonBody.academic.assessmentCount).toBeGreaterThan(0);
  });

  it("Sara with a student of her own class: unchanged, the full report", async () => {
    const ctx = setup();
    const r = await as(ctx, SARA, "/api/reports?type=student&studentId=s01");
    expect(r.status).toBe(200);
    expect(r.jsonBody.student).toMatchObject({ classId: "c1", className: "صف 1" });
    expect(r.jsonBody.academic.assessmentCount).toBeGreaterThan(0);
  });

  it("a student who is not Sara's at all is still a 404 (unchanged)", async () => {
    const ctx = setup();
    const r = await as(ctx, SARA, "/api/reports?type=student&studentId=s12");
    expect(r.status).toBe(404);
  });
});
