import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P5-B1 — classes & student permissions (owner decision D18 revised: the owner creates classes; the teacher adds, edits and
// archives students inside their own classes). TEST data only; real managed sessions, the capability map, enforce mode.
// FAIL-FIRST (first block): `update` could do what two other capabilities gate —
//   • a class change (= a move) needed only students.student.edit, while the move itself needs students.student.move;
//   • a new password needed only students.student.edit, while a reset needs students.credential.reset —
// so a teacher the owner denied either one could still do it through `update`. Now each needs its own capability.
// Then: acceptance test 10 (add → archive → restore, the results untouched), the teacher's boundaries (own classes only; no class
// creation, no permanent delete under full-teaching), and the 10 teachers × 3 classes × 30 students scale.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p5b1-student-scope-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: students } = await import("../src/functions/manage-students.js");
const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";
const cls = (classId, ownerId) => ({ schemaVersion: 1, classId, name: "صف " + classId, grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [], ownerId });

function setup({ preset = "full-teaching", denies = [], mode = "enforce", extraClasses = {} } = {}) {
  resetRevisionCache(); resetOperatorGateCache();
  const mem = createMemoryContainer({ "platform/classes/cA.json": cls("cA", SARA), "platform/classes/cA2.json": cls("cA2", SARA), "platform/classes/cB.json": cls("cB", OMAR), ...extraClasses });
  for (const [id, d] of [[SARA, denies], [OMAR, []]]) {
    const { revision } = buildRevision({ accountId: id, presetId: preset, presetVersion: 1, denies: d, createdBy: "owner:x" });
    mem.setJson(revisionName(revision.revisionId), revision);
    mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username: "t." + id.slice(-2), displayName: "معلم", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: preset, version: 1 } });
  }
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  const audit = [];
  const deps = { container: mem.container, getContainer: () => mem.container, recordAuditEvent: async (_c, ev) => { audit.push(ev); } };
  const tokenOf = id => recordedManagedToken(mem, { accountId: id, sid: newTeacherSessionId(), authVersion: 1 }).token;
  return { mem, deps, audit, sara: { "x-builder-token": tokenOf(SARA) }, omar: { "x-builder-token": tokenOf(OMAR) } };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const post = (ctx, headers, body) => students({ method: "POST", url: "https://x/api/students", headers: hdr(headers), json: async () => body }, ctx.deps);
const postClass = (ctx, headers, body) => classrooms({ method: "POST", url: "https://x/api/classrooms", headers: hdr(headers), json: async () => body }, ctx.deps);
const list = (ctx, headers, q = "") => students({ method: "GET", url: "https://x/api/students" + q, headers: hdr(headers) }, ctx.deps);
let seq = 100000000;
async function add(ctx, headers = ctx.sara, classId = "cA") {
  const r = await post(ctx, headers, { action: "create", classId, firstName: "طالب", familyName: "تجريبي", identityNumber: String(seq++) });
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
  return r.jsonBody.student;
}
const userDoc = (ctx, id) => ctx.mem.getJson("platform/users/" + id + ".json");
const editBody = (s, over = {}) => ({ action: "update", userId: s.userId, firstName: "طالب", familyName: "تجريبي", identityNumber: s.identityNumber || s.code, profileRevision: userDoc({ mem: ctxMem }, s.userId)?.profileRevision, ...over });
let ctxMem;
const snapshot = ctx => JSON.stringify([...ctx.mem.store.entries()].filter(([n]) => !n.startsWith("platform/audit")).sort());

describe("P5-B1 fail-first — `update` cannot do what another capability gates", () => {
  it("a teacher denied students.student.move cannot move a student by editing their class", async () => {
    const ctx = setup({ denies: ["students.student.move"] }); ctxMem = ctx.mem;
    const s = await add(ctx);
    const before = snapshot(ctx);
    const r = await post(ctx, ctx.sara, editBody(s, { classId: "cA2" }));
    expect([r.status, r.jsonBody.code]).toEqual([403, "CAPABILITY_DENIED"]);
    expect(snapshot(ctx)).toBe(before);
    expect(userDoc(ctx, s.userId).classId).toBe("cA");
  });
  it("a teacher denied students.credential.reset cannot set a new password by editing the student", async () => {
    const ctx = setup({ denies: ["students.credential.reset"] }); ctxMem = ctx.mem;
    const s = await add(ctx);
    const before = snapshot(ctx);
    const r = await post(ctx, ctx.sara, editBody(s, { password: "NewPass#2026" }));
    expect([r.status, r.jsonBody.code]).toEqual([403, "CAPABILITY_DENIED"]);
    expect(snapshot(ctx)).toBe(before);
  });
});

describe("P5-B1 `update` is unchanged otherwise", () => {
  it("with the capabilities, the same edits work (move between own classes, new password); a plain edit never needs them", async () => {
    const ctx = setup(); ctxMem = ctx.mem;
    const s = await add(ctx);
    const moved = await post(ctx, ctx.sara, editBody(s, { classId: "cA2" }));
    expect(moved.status, JSON.stringify(moved.jsonBody)).toBe(200);
    expect(userDoc(ctx, s.userId).classId).toBe("cA2");
    const pw = await post(ctx, ctx.sara, editBody(s, { password: "NewPass#2026" }));
    expect([pw.status, pw.jsonBody.passwordChanged]).toEqual([200, true]);
    const denied = setup({ denies: ["students.student.move", "students.credential.reset"] }); ctxMem = denied.mem;
    const t = await add(denied);
    const plain = await post(denied, denied.sara, editBody(t, { firstName: "اسم", classId: "cA" }));   // same class, no password
    expect(plain.status, JSON.stringify(plain.jsonBody)).toBe(200);
    expect(userDoc(denied, t.userId).firstName).toBe("اسم");
  });
  it("before enforcement nothing changes (legacy / observe): the edit still moves and resets", async () => {
    for (const mode of ["legacy", "observe"]) {
      const ctx = setup({ mode, denies: ["students.student.move", "students.credential.reset"] }); ctxMem = ctx.mem;
      const s = await add(ctx);
      expect((await post(ctx, ctx.sara, editBody(s, { classId: "cA2", password: "NewPass#2026" }))).status).toBe(200);
    }
  });
});

describe("P5-B1 acceptance test 10 — add, archive, restore; the results stay intact", () => {
  it("a student added to my class is archived and restored; their submissions are never touched", async () => {
    const ctx = setup(); ctxMem = ctx.mem;
    const s = await add(ctx);
    const sub = { assignmentId: "as1", studentId: s.userId, classId: "cA", attempts: [{ attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, finalized: true }] };
    ctx.mem.setJson("platform/submissions/as1/" + s.userId + ".json", sub);
    const subBefore = JSON.stringify(ctx.mem.getJson("platform/submissions/as1/" + s.userId + ".json"));
    expect((await post(ctx, ctx.sara, { action: "archive", userId: s.userId })).status).toBe(200);
    expect(userDoc(ctx, s.userId).archived).toBe(true);
    expect((await list(ctx, ctx.sara, "?classId=cA")).jsonBody.students.map(x => x.userId)).not.toContain(s.userId);
    expect((await list(ctx, ctx.sara, "?classId=cA&includeArchived=1")).jsonBody.students.map(x => x.userId)).toContain(s.userId);
    expect((await post(ctx, ctx.sara, { action: "unarchive", userId: s.userId })).status).toBe(200);
    expect(userDoc(ctx, s.userId).archived).toBe(false);
    expect(JSON.stringify(ctx.mem.getJson("platform/submissions/as1/" + s.userId + ".json"))).toBe(subBefore);
    expect(ctx.audit.map(e => e.action)).toEqual(expect.arrayContaining(["student.create", "student.archive", "student.unarchive"]));
  });
});

describe("P5-B1 the teacher's boundaries (D18 revised)", () => {
  it("only my own classes: another teacher's class or student is answered like a missing one; nothing written", async () => {
    const ctx = setup(); ctxMem = ctx.mem;
    const omars = await add(ctx, ctx.omar, "cB");
    const before = snapshot(ctx);
    expect((await post(ctx, ctx.sara, { action: "create", classId: "cB", firstName: "ط", familyName: "ت", identityNumber: String(seq++) })).status).toBe(400);
    expect((await post(ctx, ctx.sara, editBody(omars))).status).toBe(404);
    for (const action of ["archive", "unarchive", "resetpassword", "toggleactive"]) expect([action, (await post(ctx, ctx.sara, { action, userId: omars.userId })).status]).toEqual([action, 404]);
    const mine = await add(ctx);
    const afterMine = snapshot(ctx);
    expect((await post(ctx, ctx.sara, editBody(mine, { classId: "cB" }))).status).toBe(400);
    const bulk = await post(ctx, ctx.sara, { action: "bulkAction", operation: "move", userIds: [mine.userId], targetClassId: "cB" });
    expect(bulk.status).toBe(400);
    expect(snapshot(ctx)).toBe(afterMine);
    expect(before).not.toBe(afterMine);
    expect((await list(ctx, ctx.sara)).jsonBody.students.map(x => x.userId)).toEqual([mine.userId]);
  });
  it("full-teaching: no class creation and no permanent delete (the owner creates classes; deleting a student is archiving)", async () => {
    const ctx = setup(); ctxMem = ctx.mem;
    const s = await add(ctx);
    const before = snapshot(ctx);
    expect((await postClass(ctx, ctx.sara, { action: "create", name: "صف جديد", grade: "11", schoolYear: "2026" })).jsonBody.code).toBe("CAPABILITY_DENIED");
    expect((await post(ctx, ctx.sara, { action: "delete", userId: s.userId })).jsonBody.code).toBe("CAPABILITY_DENIED");
    expect((await post(ctx, ctx.sara, { action: "bulkAction", operation: "delete", userIds: [s.userId] })).jsonBody.code).toBe("CAPABILITY_DENIED");
    expect(snapshot(ctx)).toBe(before);
  });
});

describe("P5-B1 scale — 10 teachers × 3 classes × 30 students", () => {
  it("each teacher lists exactly their own 90 students, and the list does not read more per teacher as teachers are added", async () => {
    const teachers = Array.from({ length: 10 }, (_, i) => "t_00112233445566" + (0xa0 + i).toString(16));
    const extra = {};
    for (const t of teachers) for (let c = 0; c < 3; c++) extra["platform/classes/" + t + "-c" + c + ".json"] = cls(t + "-c" + c, t);
    const ctx = setup({ extraClasses: extra }); ctxMem = ctx.mem;
    for (const t of teachers) {
      const { revision } = buildRevision({ accountId: t, presetId: "full-teaching", presetVersion: 1, denies: [], createdBy: "owner:x" });
      ctx.mem.setJson(revisionName(revision.revisionId), revision);
      ctx.mem.setJson(teacherAccountName(t), { schemaVersion: 1, accountId: t, role: "teacher", username: "u" + t.slice(-2), displayName: "م", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version: 1 } });
    }
    const tokens = Object.fromEntries(teachers.map(t => [t, { "x-builder-token": recordedManagedToken(ctx.mem, { accountId: t, sid: newTeacherSessionId(), authVersion: 1 }).token }]));
    for (const t of teachers) for (let c = 0; c < 3; c++) for (let k = 0; k < 30; k++) await add(ctx, tokens[t], t + "-c" + c);
    const started = Date.now();
    for (const t of teachers) {
      const r = await list(ctx, tokens[t]);
      expect(r.status).toBe(200);
      expect(r.jsonBody.students).toHaveLength(90);
      expect(new Set(r.jsonBody.students.map(s => s.classId))).toEqual(new Set([0, 1, 2].map(c => t + "-c" + c)));
    }
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(ctx.mem.names("platform/users/")).toHaveLength(900);
  }, 120_000);
});
