import { describe, it, expect } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";

// Tadris+ P10-J — enrolling a class in a project is governed by the PROJECTS capability (closes security review O10; design
// docs/enterprise-project-enrolment-p10j.md, owner decision §19.47: «صلاحية المشاريع وحدها»). setPrograms / setProgram used to ask
// learning.course.assign, so a «التعلّم فقط» teacher (no projects) enrolled classes in projects while a teacher the owner gave the
// projects capability without course assignment could not. Real handler, enforce mode, recorded managed sessions over the in-memory
// container. TEST data only.

process.env.BANK_SETUP_KEY = "p10j-enrolment-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName, resetRevisionCache } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { resetOperatorGateCache } = await import("../src/lib/identity/operator-gate.js");

const TEACHER = "t_00000000000000d1";
const PROJECT = "899373";
// Course assignment withheld by the owner; module release depends on it (capabilities.js), so it goes with it.
const COURSE_ASSIGN = ["learning.course.assign", "learning.module.release"];

/**
 * A platform with ONE managed teacher on `preset` (minus `denies`), the class c1 they own, and the access `mode`.
 * Returns the teacher's request helper and the store.
 */
function platform({ preset, version = 1, denies = [], mode = "enforce", programCodes = [] }) {
  resetRevisionCache(); resetOperatorGateCache();
  const mem = createMemoryContainer();
  const { revision } = buildRevision({ accountId: TEACHER, presetId: preset, presetVersion: version, denies, createdBy: "owner:own_0011223344556677" });
  mem.setJson(revisionName(revision.revisionId), revision);
  mem.setJson(teacherAccountName(TEACHER), { schemaVersion: 1, accountId: TEACHER, role: "teacher", username: "t.huda", displayName: "معلمة تجريبية", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: preset, version } });
  mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  mem.setJson("platform/classes/c1.json", { classId: "c1", name: "صف تجريبي", grade: "11", schoolYear: "2026", status: "active", active: true, ownerId: TEACHER, studentIds: [], programCodes, createdAt: "2026-01-01T00:00:00.000Z" });
  const token = recordedManagedToken(mem, { accountId: TEACHER, sid: newTeacherSessionId(), authVersion: 1 }).token;
  const deps = { getContainer: () => mem.container, container: mem.container, recordAuditEvent: async () => {} };
  const post = body => classrooms({ method: "POST", url: "https://x/api/classrooms", headers: { get: k => (String(k).toLowerCase() === "x-builder-token" ? token : null) }, json: async () => body }, deps);
  const snapshot = () => JSON.stringify([...mem.store.entries()].map(([n, e]) => [n, e.content.toString("base64")]).sort());
  return { mem, post, snapshot, codes: () => mem.getJson("platform/classes/c1.json").programCodes };
}
const denied = r => r.status === 403 && r.jsonBody && r.jsonBody.code === "CAPABILITY_DENIED";

describe("P10-J fail-first: the projects capability, not course assignment, decides who enrols a class in a project (O10)", () => {
  it("a «التعلّم فقط» teacher (no projects capability) is refused 403 and nothing stored changes (baseline: 200, the class is enrolled)", async () => {
    const p = platform({ preset: "learning-only" });
    const before = p.snapshot();
    const r = await p.post({ action: "setPrograms", classId: "c1", programCodes: [PROJECT], baseProgramCodes: [] });
    expect(r.status + " " + (r.jsonBody && r.jsonBody.code)).toBe("403 CAPABILITY_DENIED");
    expect(p.snapshot()).toBe(before);
    expect(p.codes()).toEqual([]);
  });

  it("the legacy setProgram is refused the same way (baseline: 200)", async () => {
    const p = platform({ preset: "learning-ready-assignments" });
    const before = p.snapshot();
    const r = await p.post({ action: "setProgram", classId: "c1", programCode: PROJECT });
    expect(denied(r)).toBe(true);
    expect(p.snapshot()).toBe(before);
  });

  it("a teacher the owner gave projects but NOT course assignment enrols and removes their class (baseline: 403)", async () => {
    const p = platform({ preset: "full-teaching", version: 2, denies: COURSE_ASSIGN });
    const add = await p.post({ action: "setPrograms", classId: "c1", programCodes: [PROJECT], baseProgramCodes: [] });
    expect(add.status).toBe(200);
    expect(p.codes()).toEqual([PROJECT]);
    const legacy = await p.post({ action: "setProgram", classId: "c1", programCode: "" });
    expect(legacy.status).toBe(200);
    expect(p.codes()).toEqual([]);
  });
});

describe("P10-J the projects capability alone: managing the class is neither needed nor enough", () => {
  it("a teacher who manages classes but was refused the projects capability is refused 403; nothing stored changes", async () => {
    const p = platform({ preset: "full-teaching", version: 2, denies: ["projects.tracker.manage"] });
    const before = p.snapshot();
    expect(denied(await p.post({ action: "setPrograms", classId: "c1", programCodes: [PROJECT], baseProgramCodes: [] }))).toBe(true);
    expect(p.snapshot()).toBe(before);
  });

  it("«التعليم الكامل» v1 (projects, but not classes.class.manage) enrols its class", async () => {
    const p = platform({ preset: "full-teaching", version: 1 });
    expect((await p.post({ action: "setPrograms", classId: "c1", programCodes: [PROJECT], baseProgramCodes: [] })).status).toBe(200);
    expect(p.codes()).toEqual([PROJECT]);
  });
});

describe("P10-J what does not change", () => {
  it("«التعليم الكامل» (both capabilities) enrols and removes exactly as before", async () => {
    const p = platform({ preset: "full-teaching", version: 2 });
    expect((await p.post({ action: "setPrograms", classId: "c1", programCodes: [PROJECT], baseProgramCodes: [] })).status).toBe(200);
    expect(p.codes()).toEqual([PROJECT]);
    expect((await p.post({ action: "setPrograms", classId: "c1", programCodes: [], baseProgramCodes: [PROJECT] })).status).toBe(200);
    expect(p.codes()).toEqual([]);
  });

  it("a teacher without the projects capability keeps every existing enrolment: refusal changes nothing, removal is refused too", async () => {
    const p = platform({ preset: "learning-only", programCodes: [PROJECT] });
    const r = await p.post({ action: "setPrograms", classId: "c1", programCodes: [], baseProgramCodes: [PROJECT] });
    expect(denied(r)).toBe(true);
    expect(p.codes()).toEqual([PROJECT]);
  });

  it("removing a COURSE from a class still asks learning.course.assign (the projects-only teacher is refused it)", async () => {
    const p = platform({ preset: "full-teaching", version: 2, denies: COURSE_ASSIGN });
    expect(denied(await p.post({ action: "removeLearningCourse", classId: "c1", courseId: "any" }))).toBe(true);
  });

  it("observe mode refuses nothing: the «التعلّم فقط» teacher's request goes through, as today", async () => {
    const p = platform({ preset: "learning-only", mode: "observe" });
    const r = await p.post({ action: "setPrograms", classId: "c1", programCodes: [PROJECT], baseProgramCodes: [] });
    expect(r.status).toBe(200);
    expect(p.codes()).toEqual([PROJECT]);
  });
});
