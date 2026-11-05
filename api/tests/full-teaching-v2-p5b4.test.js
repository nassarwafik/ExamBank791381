import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P5-B4 — «المالك يقوم بانشاء الصفوف وايضا المعلم لديه القدرة». TEST data only; real managed sessions, enforce mode.
// full-teaching v2 = v1 + classes.class.create / classes.class.manage. v1 is unchanged (a published version never changes): a teacher
// on it still cannot create a class; the owner moves a teacher to v2 by assigning it. Only the CURRENT version is offered to new choices.
const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p5b4-full-teaching-v2-root-secret";
for (const k of ["BUILDER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];
const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const P = cjs("../src/lib/access/presets.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");
const SARA = "t_00112233445566aa";

function setup(version) {
  resetRevisionCache(); resetOperatorGateCache();
  const mem = createMemoryContainer();
  const { revision } = buildRevision({ accountId: SARA, presetId: "full-teaching", presetVersion: version, createdBy: "owner:x" });
  mem.setJson(revisionName(revision.revisionId), revision);
  mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version } });
  mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "enforce" });
  const headers = { "x-builder-token": recordedManagedToken(mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token };
  const post = body => classrooms({ method: "POST", url: "https://x/api/classrooms", headers: { get: k => headers[String(k).toLowerCase()] ?? null }, json: async () => body }, { container: mem.container, getContainer: () => mem.container, recordAuditEvent: async () => {} });
  return { mem, post };
}

describe("P5-B4 full-teaching v2", () => {
  it("is v1 plus class create / manage — nothing else; v1 is unchanged; only v2 is current", () => {
    const v1 = new Set(P.preset("full-teaching", 1).capabilities), v2 = new Set(P.preset("full-teaching", 2).capabilities);
    expect([...v2].filter(c => !v1.has(c)).sort()).toEqual(["classes.class.create", "classes.class.manage"]);
    expect([...v1].filter(c => !v2.has(c))).toEqual([]);
    expect(v2.has("students.student.delete")).toBe(false);
    expect([P.isCurrentPreset(P.preset("full-teaching", 1)), P.isCurrentPreset(P.preset("full-teaching", 2))]).toEqual([false, true]);
    expect(P.presetProblems()).toEqual([]);
  });
  it("a teacher on v2 creates, renames and archives her own class; a teacher on v1 still cannot create one", async () => {
    const v2 = setup(2);
    const c = await v2.post({ action: "create", name: "صفي", grade: "11", schoolYear: "2026-2027" });
    expect(c.status, JSON.stringify(c.jsonBody)).toBe(200);
    const classId = c.jsonBody.classroom.classId;
    expect(v2.mem.getJson("platform/classes/" + classId + ".json").ownerId).toBe(SARA);
    expect((await v2.post({ action: "update", classId, name: "صفي ب", grade: "11", schoolYear: "2026-2027" })).status).toBe(200);
    expect((await v2.post({ action: "archive", classId })).status).toBe(200);
    const v1 = setup(1);
    expect((await v1.post({ action: "create", name: "صفي", grade: "11", schoolYear: "2026-2027" })).jsonBody.code).toBe("CAPABILITY_DENIED");
    expect(v1.mem.names("platform/classes/")).toEqual([]);
  });
});
