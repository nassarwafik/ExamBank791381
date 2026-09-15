import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { handler as studentHandler } from "../src/functions/manage-students.js";
import { handler as classroomHandler } from "../src/functions/manage-classrooms.js";
import { normalizeRosterIds, canonicalMemberIds, addToRosterIndex, removeFromRosterIndex, reconcileRosterIndex } from "../src/lib/class-roster-index.js";
import { studentCodeHash } from "../src/lib/student-auth.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Roadmap #25 — Authoritative Membership Index Consistency.
//
// Source of truth = USER documents (isStudentClassMember, Roadmap #24). classroom.studentIds = a denormalized,
// repairable COUNT index. These tests drive the REAL manage-students / manage-classrooms handlers and the real
// class-roster-index module over the in-memory container (faithful ETag CAS + the beforeConditionalUpload hook
// to inject concurrent writers / persistent conflicts). They prove: the user document always wins; every
// writer leaves authoritative state correct even when the index write fails (sync status, not a 500); the
// roster read repairs drift with ZERO extra scans and at most one class write; stale reconciliation can never
// remove a concurrently-added member or resurrect a concurrently-moved one; the class list never scans users.

const CP = "platform/classes/", UP = "platform/users/", AP_AUTH = "platform/auth/";
const C1 = CP + "c1.json", C2 = CP + "c2.json";
const AUTH_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
function deps(ctx, extra = {}) { return { ...AUTH_OK, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, ...extra }; }
const stuReq = (action, body) => ({ method: "POST", url: "https://x/api/students", json: async () => ({ action, ...body }) });
const clsReq = (action, body) => ({ method: "POST", url: "https://x/api/classrooms", json: async () => ({ action, ...body }) });
const listReq = classId => ({ method: "GET", url: "https://x/api/students?classId=" + classId + "&includeArchived=1", json: async () => ({}) });
const cls = (classId, studentIds, over = {}) => ({ classId, name: "صف " + classId, active: true, status: "active", studentIds, updatedAt: "2026-01-01T00:00:00.000Z", ...over });
const stu = (userId, classId, over = {}) => ({ userId, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "طالب " + userId, firstName: "ط", familyName: userId, code: "1000000" + userId.slice(-2).padStart(2, "0"), identityNumber: "1000000" + userId.slice(-2).padStart(2, "0"), ...over });
const ids = ctx => (ctx.getJson(C1)?.studentIds || []).slice();

// Counts list/download/upload operations by prefix/name — the performance guard for "no extra scans".
function instrument(ctx) {
  const c = ctx.container, counts = { lists: [], downloads: [], uploads: [] };
  const origList = c.listBlobsFlat.bind(c);
  c.listBlobsFlat = function (opts) { counts.lists.push(opts.prefix); return origList(opts); };
  const origGet = c.getBlobClient.bind(c);
  c.getBlobClient = name => { const cl = origGet(name); const od = cl.download.bind(cl); cl.download = async () => { counts.downloads.push(name); return od(); }; return cl; };
  const origBlock = c.getBlockBlobClient.bind(c);
  c.getBlockBlobClient = name => { const b = origBlock(name); const ou = b.upload.bind(b); b.upload = async (...a) => { counts.uploads.push(name); return ou(...a); }; return b; };
  counts.lists.of = p => counts.lists.filter(x => x === p).length;
  counts.downloads.of = p => counts.downloads.filter(x => x.startsWith(p)).length;
  counts.uploads.of = n => counts.uploads.filter(x => x === n).length;
  return counts;
}
// The profile-update path takes the per-student credential lease; the memory container has no lease API, so give
// it a pass-through lease (real lease semantics are covered by auth-hardening-r8).
function withLease(ctx) {
  const c = ctx.container, orig = c.getBlobClient.bind(c);
  c.getBlobClient = name => { const cl = orig(name); cl.getBlobLeaseClient = () => ({ acquireLease: async () => {}, releaseLease: async () => {} }); return cl; };
  return ctx;
}
// Simulates time passing (the reconcile race guard tolerates 2 s of clock skew): ages the classroom's updatedAt.
function ageClassroom(ctx, name) { const c = ctx.getJson(name); c.updatedAt = "2026-01-01T00:00:00.000Z"; ctx.setJson(name, c); }
// A class-blob conflict injector: every CAS write to `name` observes a changed ETag (persistent), or only the first N times.
function conflictOn(name, times = Infinity) {
  let n = 0;
  return { beforeConditionalUpload: (blob, api) => { if (blob !== name || n >= times) return; n += 1; api.setJson(blob, api.getJson(blob)); } };
}

describe("R25 A — cache semantics: the user document wins, the index is repaired", () => {
  it("A1 membership comes from user documents even when studentIds disagrees; the index is then repaired", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", ["ghost"]), [UP + "s1.json"]: stu("s1", "c1") });
    const r = await studentHandler(listReq("c1"), deps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.students.map(s => s.userId)).toEqual(["s1"]);          // ghost is NOT a member; s1 is
    expect(ids(ctx)).toEqual(["s1"]);                                          // index repaired to the truth
  });
  it("A2 a missing member id is added", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", []), [UP + "s1.json"]: stu("s1", "c1"), [UP + "s2.json"]: stu("s2", "c1") });
    await studentHandler(listReq("c1"), deps(ctx));
    expect(ids(ctx)).toEqual(["s1", "s2"]);
  });
  it("A3 an extra (non-member) id is removed", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", ["s1", "gone"]), [UP + "s1.json"]: stu("s1", "c1") });
    await studentHandler(listReq("c1"), deps(ctx));
    expect(ids(ctx)).toEqual(["s1"]);
  });
  it("A4 duplicate / blank ids normalize safely (deterministic sorted order on rewrite)", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", ["s2", "s1", "s1", "", "s2"]), [UP + "s1.json"]: stu("s1", "c1"), [UP + "s2.json"]: stu("s2", "c1") });
    await studentHandler(listReq("c1"), deps(ctx));
    expect(ids(ctx)).toEqual(["s1", "s2"]);
    expect(normalizeRosterIds([" a ", "a", null, "", "b"])).toEqual(["a", "b"]);
  });
  it("A5 an archived student's id is removed", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", ["s1", "sA"]), [UP + "s1.json"]: stu("s1", "c1"), [UP + "sA.json"]: stu("sA", "c1", { active: false, archived: true }) });
    await studentHandler(listReq("c1"), deps(ctx));
    expect(ids(ctx)).toEqual(["s1"]);
  });
  it("A6 a login-disabled (active:false, non-archived) member stays in the index", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", ["s1"]), [UP + "s1.json"]: stu("s1", "c1"), [UP + "sD.json"]: stu("sD", "c1", { active: false }) });
    await studentHandler(listReq("c1"), deps(ctx));
    expect(ids(ctx)).toEqual(["s1", "sD"]);
  });
  it("A7 an id belonging to another class is removed (and never added to the wrong class)", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", ["s1", "s2"]), [C2]: cls("c2", []), [UP + "s1.json"]: stu("s1", "c1"), [UP + "s2.json"]: stu("s2", "c2") });
    await studentHandler(listReq("c1"), deps(ctx));
    expect(ids(ctx)).toEqual(["s1"]);
    expect(ctx.getJson(C2).studentIds).toEqual([]);                            // c2 untouched by a c1 read
    expect(canonicalMemberIds([stu("s1", "c1"), stu("s2", "c2"), stu("sA", "c1", { archived: true }), { userId: "t", role: "teacher", classId: "c1" }], "c1")).toEqual(["s1"]);
  });
});

describe("R25 B — writer failures: authoritative state first, index sync status instead of a 500", () => {
  it("B8/B9 create: user + auth written, persistent index CAS conflict → 200 ok with rosterSynced:false (accurate)", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", []) }, conflictOn(C1));
    const r = await studentHandler(stuReq("create", { classId: "c1", firstName: "علي", familyName: "حسن", identityNumber: "123456789" }), deps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.ok).toBe(true);
    expect(r.jsonBody.rosterSynced).toBe(false);
    expect(ctx.names(UP)).toHaveLength(1);                                     // the student EXISTS
    expect(ctx.getJson(UP + r.jsonBody.student.userId + ".json").classId).toBe("c1");
    expect(ids(ctx)).toEqual([]);                                              // index honestly stale
  });
  it("B9 create without conflict → rosterSynced:true and the id is in the index", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", []) });
    const r = await studentHandler(stuReq("create", { classId: "c1", firstName: "علي", familyName: "حسن", identityNumber: "123456789" }), deps(ctx));
    expect(r.jsonBody.rosterSynced).toBe(true);
    expect(ids(ctx)).toEqual([r.jsonBody.student.userId]);
  });
  it("B10 retrying the same create after a deferred sync does NOT create a duplicate student", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", []) }, conflictOn(C1));
    const first = await studentHandler(stuReq("create", { classId: "c1", firstName: "علي", familyName: "حسن", identityNumber: "123456789" }), deps(ctx));
    expect(first.jsonBody.rosterSynced).toBe(false);
    const again = await studentHandler(stuReq("create", { classId: "c1", firstName: "علي", familyName: "حسن", identityNumber: "123456789" }), deps(ctx));
    expect(again.jsonBody.ok).not.toBe(true);                                  // duplicate identity refused
    expect(ctx.names(UP)).toHaveLength(1);
  });
  it("B11 bulkImport rosterSynced:false → the next roster read repairs the index (no extra scan) and the explicit action reports counts", async () => {
    const hook = conflictOn(C1, 5);                                            // exhausts the 5 CAS attempts once, then clears
    const ctx = createMemoryContainer({ [C1]: cls("c1", []) }, hook);
    const imp = await studentHandler(stuReq("bulkImport", { classId: "c1", students: [{ firstName: "أ", familyName: "ب", identityNumber: "111111111" }, { firstName: "ج", familyName: "د", identityNumber: "222222222" }] }), deps(ctx));
    expect(imp.jsonBody.imported).toBe(2);
    expect(imp.jsonBody.rosterSynced).toBe(false);
    expect(ids(ctx)).toEqual([]);
    const list = await studentHandler(listReq("c1"), deps(ctx));
    expect(list.jsonBody.students).toHaveLength(2);
    expect(ids(ctx).length).toBe(2);                                           // self-healed on the roster read
    const rec = await classroomHandler(clsReq("reconcileRoster", { classId: "c1" }), deps(ctx));
    expect(rec.status).toBe(200);
    expect(rec.jsonBody).toMatchObject({ ok: true, classId: "c1", beforeCount: 2, authoritativeCount: 2, repairedCount: 2, changed: false, rosterSynced: true });
  });
});

describe("R25 C — mutation flows keep authoritative state correct even when the index write fails", () => {
  const seedTwo = hooks => createMemoryContainer({ [C1]: cls("c1", ["s1"]), [C2]: cls("c2", []), [UP + "s1.json"]: stu("s1", "c1"), [UP + "sA.json"]: stu("sA", "c1", { active: false, archived: true }) }, hooks);
  it("C12 archive: user archived + login disabled; index conflict → 200 rosterSynced:false (happy path removes the id)", async () => {
    const ctx = seedTwo(conflictOn(C1));
    const r = await studentHandler(stuReq("archive", { userId: "s1" }), deps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, archived: true, rosterSynced: false });
    expect(ctx.getJson(UP + "s1.json")).toMatchObject({ archived: true, active: false });
    const ok = seedTwo();
    expect((await studentHandler(stuReq("archive", { userId: "s1" }), deps(ok))).jsonBody.rosterSynced).toBe(true);
    expect(ok.getJson(C1).studentIds).toEqual([]);
  });
  it("C13 unarchive: user restored; index conflict → rosterSynced:false (happy path adds the id)", async () => {
    const ctx = seedTwo(conflictOn(C1));
    const r = await studentHandler(stuReq("unarchive", { userId: "sA" }), deps(ctx));
    expect(r.jsonBody).toMatchObject({ ok: true, archived: false, active: true, rosterSynced: false });
    expect(ctx.getJson(UP + "sA.json")).toMatchObject({ archived: false, active: true });
    const ok = seedTwo();
    expect((await studentHandler(stuReq("unarchive", { userId: "sA" }), deps(ok))).jsonBody.rosterSynced).toBe(true);
    expect(ok.getJson(C1).studentIds).toEqual(["s1", "sA"]);
  });
  it("C14 bulk move: user.classId changes FIRST; old-class index conflict → processed with rosterSynced:false", async () => {
    const ctx = seedTwo(conflictOn(C1));
    const r = await studentHandler(stuReq("bulkAction", { operation: "move", userIds: ["s1"], targetClassId: "c2" }), deps(ctx));
    expect(r.jsonBody).toMatchObject({ processed: 1, failed: 0, rosterSynced: false });
    expect(ctx.getJson(UP + "s1.json").classId).toBe("c2");                    // authoritative move happened
    expect(ctx.getJson(C2).studentIds).toEqual(["s1"]);                        // target index updated
    expect(ctx.getJson(C1).studentIds).toEqual(["s1"]);                        // old index stale (deferred) …
    await studentHandler(listReq("c1"), deps(createMemoryContainer(Object.fromEntries([...ctx.store.entries()].map(([k, v]) => [k, JSON.parse(v.content)])))));
    const ok = seedTwo();
    const r2 = await studentHandler(stuReq("bulkAction", { operation: "move", userIds: ["s1"], targetClassId: "c2" }), deps(ok));
    expect(r2.jsonBody.rosterSynced).toBe(true);
    expect(ok.getJson(C1).studentIds).toEqual([]);
    expect(ok.getJson(C2).studentIds).toEqual(["s1"]);
  });
  it("C15 update-move (profile edit): user.classId written under the credential lock, then index; conflict → rosterSynced:false", async () => {
    const ctx = withLease(createMemoryContainer({ [C1]: cls("c1", ["s1"]), [C2]: cls("c2", []), [UP + "s1.json"]: stu("s1", "c1", { code: "100000001", identityNumber: "100000001" }), [AP_AUTH + studentCodeHash("100000001") + ".json"]: { userId: "s1", codeHash: studentCodeHash("100000001"), authVersion: 1, active: true, salt: "s", passwordHash: "h" } }, conflictOn(C2)));
    const r = await studentHandler(stuReq("update", { userId: "s1", firstName: "ط", familyName: "s1", identityNumber: "100000001", classId: "c2" }), deps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.rosterSynced).toBe(false);
    expect(ctx.getJson(UP + "s1.json").classId).toBe("c2");
    expect(ctx.getJson(C1).studentIds).toEqual([]);                            // old removal succeeded (c1 not conflicting)
    expect(ctx.getJson(C2).studentIds).toEqual([]);                            // target add deferred
  });
  it("C16 delete: auth + user deleted FIRST; index conflict → deleted:true rosterSynced:false", async () => {
    const ctx = seedTwo(conflictOn(C1));
    const r = await studentHandler(stuReq("delete", { userId: "s1" }), deps(ctx));
    expect(r.jsonBody).toMatchObject({ ok: true, deleted: true, rosterSynced: false });
    expect(ctx.has(UP + "s1.json")).toBe(false);
    expect(ctx.getJson(C1).studentIds).toEqual(["s1"]);                        // stale extra id …
    const list = await studentHandler(listReq("c1"), deps(createMemoryContainer(Object.fromEntries([...ctx.store.entries()].map(([k, v]) => [k, JSON.parse(v.content)])))));
    expect(list.status).toBe(200);
  });
});

describe("R25 D — reconciliation: zero extra scans, at most one write, race-safe", () => {
  it("D17 the roster read repairs drift with exactly ONE users listing, U user downloads and ONE class write", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", ["ghost"]), [UP + "s1.json"]: stu("s1", "c1"), [UP + "s2.json"]: stu("s2", "c1"), [UP + "s3.json"]: stu("s3", "c2") });
    const counts = instrument(ctx);
    await studentHandler(listReq("c1"), deps(ctx));
    expect(counts.lists.of(UP)).toBe(1);                                       // no second users scan
    expect(counts.downloads.of(UP)).toBe(3);                                   // each user blob once
    expect(counts.uploads.of(C1)).toBe(1);                                     // one repair write
    expect(ids(ctx)).toEqual(["s1", "s2"]);
  });
  it("D18 an already-synchronized index causes ZERO writes (order differences alone never write)", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", ["s2", "s1"]), [UP + "s1.json"]: stu("s1", "c1"), [UP + "s2.json"]: stu("s2", "c1") });
    const counts = instrument(ctx);
    await studentHandler(listReq("c1"), deps(ctx));
    expect(counts.uploads.of(C1)).toBe(0);
    expect(ids(ctx)).toEqual(["s2", "s1"]);                                    // untouched
  });
  it("D19 a second reconciliation is idempotent (no further write)", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", []), [UP + "s1.json"]: stu("s1", "c1") });
    const counts = instrument(ctx);
    await studentHandler(listReq("c1"), deps(ctx));
    await studentHandler(listReq("c1"), deps(ctx));
    expect(counts.uploads.of(C1)).toBe(1);
  });
  it("D20 a CAS conflict during repair is retried and the repair still lands", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", []), [UP + "s1.json"]: stu("s1", "c1") }, conflictOn(C1, 1));
    const counts = instrument(ctx);
    await studentHandler(listReq("c1"), deps(ctx));
    expect(counts.uploads.of(C1)).toBe(2);                                     // first attempt conflicted, second succeeded
    expect(ids(ctx)).toEqual(["s1"]);
  });
  it("D21 a student created concurrently (after the scan began) is NOT removed by the stale reconciliation", async () => {
    let injected = false;
    const ctx = createMemoryContainer({ [C1]: cls("c1", ["ghost"]), [UP + "s1.json"]: stu("s1", "c1") }, {
      beforeConditionalUpload: (name, api) => {
        if (name !== C1 || injected) return;
        injected = true;
        // Concurrent writer (create): authoritative user FIRST, then the index (bumps updatedAt).
        api.setJson(UP + "sNew.json", stu("sNew", "c1"));
        const c = api.getJson(C1); c.studentIds = [...c.studentIds, "sNew"]; c.updatedAt = new Date().toISOString(); api.setJson(C1, c);
      }
    });
    const r = await studentHandler(listReq("c1"), deps(ctx));
    expect(r.status).toBe(200);
    expect(ids(ctx)).toContain("sNew");                                        // never removed
    expect(ids(ctx)).toContain("ghost");                                       // repair deferred (guard), not half-applied
    ageClassroom(ctx, C1);                                                     // time passes → next cycle's scan is newer than the classroom
    await studentHandler(listReq("c1"), deps(ctx));
    expect(ids(ctx)).toEqual(["s1", "sNew"]);
  });
  it("D22 a student moved concurrently is NOT resurrected in the old class by a stale reconciliation", async () => {
    let injected = false;
    const ctx = createMemoryContainer({ [C1]: cls("c1", ["s1", "ghost"]), [C2]: cls("c2", []), [UP + "s1.json"]: stu("s1", "c1") }, {
      beforeConditionalUpload: (name, api) => {
        if (name !== C1 || injected) return;
        injected = true;
        // Concurrent move of s1 → c2: user first, then old-index removal (bumps c1.updatedAt), then new-index add.
        api.setJson(UP + "s1.json", stu("s1", "c2"));
        const c1 = api.getJson(C1); c1.studentIds = c1.studentIds.filter(id => id !== "s1"); c1.updatedAt = new Date().toISOString(); api.setJson(C1, c1);
        const c2 = api.getJson(C2); c2.studentIds = ["s1"]; c2.updatedAt = new Date().toISOString(); api.setJson(C2, c2);
      }
    });
    await studentHandler(listReq("c1"), deps(ctx));
    expect(ids(ctx)).not.toContain("s1");                                      // not resurrected
    ageClassroom(ctx, C1);
    await studentHandler(listReq("c1"), deps(ctx));
    expect(ids(ctx)).toEqual([]);                                              // ghost removed once the guard clears
    expect(ctx.getJson(C2).studentIds).toEqual(["s1"]);
  });
  it("D-lib: reconcile skips (no write) when the classroom changed after the scan began; repairs when older", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", ["ghost"], { updatedAt: new Date().toISOString() }) });
    const stale = await reconcileRosterIndex(ctx.container, "c1", ["s1"], { scanStartedAt: Date.now() - 60000 });
    expect(stale).toMatchObject({ changed: false, skipped: true, beforeCount: 1, authoritativeCount: 1 });
    expect(ids(ctx)).toEqual(["ghost"]);
    const fresh = await reconcileRosterIndex(ctx.container, "c1", ["s1"], { scanStartedAt: Date.now() + 5000 });
    expect(fresh).toMatchObject({ changed: true, skipped: false, beforeCount: 1, authoritativeCount: 1, repairedCount: 1, synced: true });
    expect(ids(ctx)).toEqual(["s1"]);
    // add/remove are idempotent and never write when nothing changes
    expect(await addToRosterIndex(ctx.container, "c1", ["s1"])).toEqual({ synced: true, changed: false });
    expect(await removeFromRosterIndex(ctx.container, "c1", ["nope"])).toEqual({ synced: true, changed: false });
    expect(await addToRosterIndex(ctx.container, "missing-class", ["s1"])).toEqual({ synced: true, changed: false });
  });
});

describe("R25 E — performance guards: normal reads stay cheap", () => {
  it("E23 GET /api/classrooms lists ONLY the classes prefix and downloads no user documents", async () => {
    const ctx = createMemoryContainer({ [C1]: cls("c1", ["s1"]), [C2]: cls("c2", []), [UP + "s1.json"]: stu("s1", "c1"), [UP + "s2.json"]: stu("s2", "c1") });
    const counts = instrument(ctx);
    const r = await classroomHandler({ method: "GET", url: "https://x/api/classrooms", json: async () => ({}) }, deps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.classes.find(c => c.classId === "c1").studentCount).toBe(1);   // cheap index count (may be stale by design)
    expect(counts.lists.slice()).toEqual([CP]);
    expect(counts.downloads.of(UP)).toBe(0);
    expect(counts.uploads.slice()).toEqual([]);
  });
  it("E23b source guard: the class listing never references the users prefix or listJson", () => {
    const src = readFileSync(new URL("../src/functions/manage-classrooms.js", import.meta.url), "utf8");
    const listClasses = src.slice(src.indexOf("async function listClasses("), src.indexOf("function programChangeAllowed("));
    expect(listClasses).not.toMatch(/platform\/users|USER_PREFIX|listJson|canonicalMemberIds/);
  });
  it("E24 the explicit reconcileRoster action is the ONLY users scan in manage-classrooms, repairs, and audits counts only", async () => {
    const audits = [];
    const ctx = createMemoryContainer({ [C1]: cls("c1", ["ghost", "s1"]), [UP + "s1.json"]: stu("s1", "c1"), [UP + "s2.json"]: stu("s2", "c1", { active: false }) });
    const counts = instrument(ctx);
    const r = await classroomHandler(clsReq("reconcileRoster", { classId: "c1" }), deps(ctx, { recordAuditEvent: async (_c, ev) => { audits.push(ev); } }));
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, classId: "c1", beforeCount: 2, authoritativeCount: 2, repairedCount: 2, changed: true, rosterSynced: true });
    expect(ids(ctx)).toEqual(["s1", "s2"]);
    expect(counts.lists.of(UP)).toBe(1);
    expect(counts.uploads.of(C1)).toBe(1);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "class.reconcileRoster", targetId: "c1", details: { beforeCount: 2, authoritativeCount: 2, repairedCount: 2 } });
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/identityNumber|password|code/);
    expect((await classroomHandler(clsReq("reconcileRoster", { classId: "nope" }), deps(ctx))).status).toBe(404);
  });
});
