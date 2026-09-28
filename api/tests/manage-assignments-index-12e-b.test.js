import { describe, it, expect } from "vitest";
import { handler as manage } from "../src/functions/manage-assignments.js";
import { handler as dashboard } from "../src/functions/student-dashboard.js";
import { CONTROL_NAME, indexName, loadPublishedAssignmentsForClasses } from "../src/lib/class-assignment-index.js";
import { classEventPrefix } from "../src/lib/notification-events.js";
import { listJson } from "../src/lib/platform-storage.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { instrumentReadCost } from "./helpers/read-cost.js";

// Phase 12E-B — the REAL manage-assignments handler keeps the per-class published index correct, on the REAL in-memory
// container (real per-assignment lease lock, real ETag CAS, real notification producer). Failure injection = the
// container's beforeConditionalUpload hook forcing persistent CAS conflicts on the index blob (a real StorageConflictError
// after the real retry budget), never a mocked index function.
//
// Invariant: a transition to "published" never commits unless the pointer was written FIRST (false negatives forbidden);
// pointer removal happens only AFTER a published assignment stopped being published and is best-effort (a stale pointer
// is filtered by every reader).

const AP = "platform/assignments/", IX = "platform/assignment-index/classes/";
const EXAM = { title: "امتحان", sections: [{ id: "s1", gradingPolicy: "all", questions: [{ marks: 10 }] }] };
const OBS_LOG = [];
const OBS = { logInfo: () => {}, logWarn: (e, f) => OBS_LOG.push({ e, f }), logError: () => {} };

function world(extraSeed = {}) {
  const hooks = {};
  const ctx = createMemoryContainer({
    // the index authority is ACTIVATED (epoch E1): readers below trust a ready E1 index — the mode where a missing
    // pointer would be a real false negative (the MIGRATING mode is covered by assignment-index-mixed-version-12e-b)
    [CONTROL_NAME]: { schemaVersion: 1, state: "authoritative", epoch: "E1", updatedAt: "2026-01-01T00:00:00.000Z" },
    "platform/classes/c1.json": { classId: "c1", name: "الصف الأول", status: "active", active: true },
    "platform/users/u1.json": { userId: "u1", role: "student", classId: "c1", active: true, archived: false, authVersion: 1, code: "S1", displayName: "علي" },
    ...extraSeed
  }, hooks);
  const rc = instrumentReadCost(ctx.container);
  return { ctx, rc, hooks, conflictIndex: (classId = "c1") => { hooks.beforeConditionalUpload = (blob, api) => { if (blob === indexName(classId)) api.setJson(blob, api.getJson(blob)); }; }, heal: () => { hooks.beforeConditionalUpload = undefined; } };
}
const deps = w => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => w.ctx.container, container: w.ctx.container, recordAuditEvent: async () => {} });
const post = (w, body) => manage({ method: "POST", url: "https://x/api/assignments", json: async () => body }, deps(w), OBS);
const create = (w, publish, title = "واجب") => post(w, { action: "create", classId: "c1", title, examSnapshot: EXAM, publish });
const idx = w => w.ctx.getJson(indexName("c1"));
const ids = w => (idx(w) || { publishedAssignmentIds: [] }).publishedAssignmentIds;
const doc = (w, id) => w.ctx.getJson(AP + id + ".json");
const events = w => w.ctx.names(classEventPrefix("c1")).filter(n => n.endsWith(".json")).length;   // class "assignment_published" events
const readerIds = async w => (await loadPublishedAssignmentsForClasses(w.ctx.container, ["c1"])).byClass.get("c1").map(a => a.assignmentId);
const seededAssignment = (id, over = {}) => ({ schemaVersion: 2, attemptModelVersion: 2, attemptPolicy: "continuous", assignmentId: id, classId: "c1", className: "الصف الأول", title: "واجب " + id, instructions: "", status: "published", openAt: "", dueAt: "", maxAttempts: 1, durationMinutes: 0, questionCount: 1, totalMarks: 10, examSnapshot: EXAM, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over });
const readyIndex = list => ({ [indexName("c1")]: { schemaVersion: 1, classId: "c1", ready: true, epoch: "E1", publishedAssignmentIds: list, updatedAt: "2026-01-01T00:00:00.000Z" } });
const order = (w, a, b) => { const u = w.rc.ops.uploads; return [u.indexOf(a), u.indexOf(b)]; };

describe("12E-B writers — create", () => {
  it("create DRAFT: no index pointer, no index write", async () => {
    const w = world();
    const r = await create(w, false);
    expect(r.status).toBe(200);
    expect(r.jsonBody.assignment.status).toBe("draft");
    expect(w.ctx.has(indexName("c1"))).toBe(false);
    expect(w.rc.uploadsOf(IX)).toBe(0);
  });

  it("create PUBLISHED: the pointer is written BEFORE the assignment document (absent index → ready:false), then the notification", async () => {
    const w = world();
    const r = await create(w, true);
    expect(r.status).toBe(200);
    const id = r.jsonBody.assignment.assignmentId;
    expect(idx(w)).toMatchObject({ ready: false, publishedAssignmentIds: [id] });
    const [ix, ap] = order(w, indexName("c1"), AP + id + ".json");
    expect(ix).toBeGreaterThanOrEqual(0); expect(ap).toBeGreaterThan(ix);
    expect(events(w)).toBe(1);
    expect(await readerIds(w)).toEqual([id]);                                    // bootstrap keeps it and serves it
  });

  it("create PUBLISHED with a persistent index conflict: 503, NO assignment document, no notification (never a published orphan)", async () => {
    const w = world(readyIndex([]));
    w.conflictIndex();
    const r = await create(w, true);
    expect(r.status).toBe(503);
    expect(w.ctx.names(AP)).toEqual([]);
    expect(events(w)).toBe(0);
    expect(OBS_LOG.some(l => l.e === "assignment.index.ensure_failed" && l.f.action === "create")).toBe(true);
  });
});

describe("12E-B writers — setstatus", () => {
  it("draft → published: pointer written BEFORE the published CAS commits; one notification", async () => {
    const w = world(readyIndex([]));
    const id = (await create(w, false)).jsonBody.assignment.assignmentId;
    w.rc.reset();
    const r = await post(w, { action: "setstatus", assignmentId: id, status: "published" });
    expect(r.status).toBe(200);
    expect(ids(w)).toEqual([id]);
    const [ix, ap] = order(w, indexName("c1"), AP + id + ".json");
    expect(ap).toBeGreaterThan(ix);
    expect(doc(w, id).status).toBe("published");
    expect(events(w)).toBe(1);
  });

  it("draft → published with a persistent index conflict: 503 and the assignment STAYS draft (no notification)", async () => {
    const w = world(readyIndex([]));
    const id = (await create(w, false)).jsonBody.assignment.assignmentId;
    w.conflictIndex();
    const r = await post(w, { action: "setstatus", assignmentId: id, status: "published" });
    expect(r.status).toBe(503);
    expect(doc(w, id).status).toBe("draft");
    expect(events(w)).toBe(0);
    w.heal();
    expect(await readerIds(w)).toEqual([]);
  });

  it("published → published (idempotent republish) REPAIRS a missing pointer, without a second notification", async () => {
    const w = world({ ...readyIndex([]), [AP + "p1.json"]: seededAssignment("p1") });
    expect(await readerIds(w)).toEqual([]);                                     // the missing pointer hides it (ready index)
    const r = await post(w, { action: "setstatus", assignmentId: "p1", status: "published" });
    expect(r.status).toBe(200);
    expect(ids(w)).toEqual(["p1"]);
    expect(await readerIds(w)).toEqual(["p1"]);
    expect(events(w)).toBe(0);
  });

  it("published → draft: the status commits FIRST, then the pointer is removed", async () => {
    const w = world({ ...readyIndex(["p1"]), [AP + "p1.json"]: seededAssignment("p1") });
    w.rc.reset();
    const r = await post(w, { action: "setstatus", assignmentId: "p1", status: "draft" });
    expect(r.status).toBe(200);
    expect(doc(w, "p1").status).toBe("draft");
    expect(ids(w)).toEqual([]);
    const [ix, ap] = order(w, indexName("c1"), AP + "p1.json");
    expect(ix).toBeGreaterThan(ap);
  });

  it("published → draft with a failing pointer removal: still 200/draft; the stale pointer is ignored by readers", async () => {
    const w = world({ ...readyIndex(["p1"]), [AP + "p1.json"]: seededAssignment("p1") });
    w.conflictIndex();
    OBS_LOG.length = 0;
    const r = await post(w, { action: "setstatus", assignmentId: "p1", status: "draft" });
    expect(r.status).toBe(200);
    expect(doc(w, "p1").status).toBe("draft");
    expect(ids(w)).toEqual(["p1"]);                                               // stale
    expect(OBS_LOG).toEqual([{ e: "assignment.index.cleanup_failed", f: { action: "setstatus", assignmentId: "p1", retryable: true } }]);
    w.heal();
    expect(await readerIds(w)).toEqual([]);
  });
});

describe("12E-B writers — archive / restore / purge", () => {
  it("archive a PUBLISHED assignment: archive commits first, pointer removed after; submissions untouched", async () => {
    const w = world({ ...readyIndex(["p1"]), [AP + "p1.json"]: seededAssignment("p1") });
    w.rc.reset();
    const r = await post(w, { action: "archive", assignmentId: "p1" });
    expect(r.status).toBe(200);
    expect(doc(w, "p1")).toMatchObject({ status: "archived", archivedFromStatus: "published" });
    expect(ids(w)).toEqual([]);
    const [ix, ap] = order(w, indexName("c1"), AP + "p1.json");
    expect(ix).toBeGreaterThan(ap);
  });

  it("archive with a failing pointer removal: still archived + 200; readers omit the stale pointer", async () => {
    const w = world({ ...readyIndex(["p1"]), [AP + "p1.json"]: seededAssignment("p1") });
    w.conflictIndex();
    const r = await post(w, { action: "archive", assignmentId: "p1" });
    expect(r.status).toBe(200);
    expect(doc(w, "p1").status).toBe("archived");
    expect(ids(w)).toEqual(["p1"]);
    w.heal();
    expect(await readerIds(w)).toEqual([]);
  });

  it("archive a DRAFT: no index write at all", async () => {
    const w = world({ ...readyIndex([]), [AP + "d1.json"]: seededAssignment("d1", { status: "draft" }) });
    w.rc.reset();
    expect((await post(w, { action: "archive", assignmentId: "d1" })).status).toBe(200);
    expect(w.rc.uploadsOf(IX)).toBe(0);
  });

  it("restore a previously PUBLISHED assignment: pointer ensured BEFORE the restore commits", async () => {
    const w = world({ ...readyIndex([]), [AP + "p1.json"]: seededAssignment("p1", { status: "archived", archivedFromStatus: "published", archivedAt: "2026-02-01T00:00:00.000Z" }) });
    w.rc.reset();
    const r = await post(w, { action: "restore", assignmentId: "p1" });
    expect(r.status).toBe(200);
    expect(doc(w, "p1").status).toBe("published");
    expect(ids(w)).toEqual(["p1"]);
    const [ix, ap] = order(w, indexName("c1"), AP + "p1.json");
    expect(ap).toBeGreaterThan(ix);
    expect(await readerIds(w)).toEqual(["p1"]);
  });

  it("restore-to-published with a persistent index conflict: 503 and the assignment STAYS archived", async () => {
    const w = world({ ...readyIndex([]), [AP + "p1.json"]: seededAssignment("p1", { status: "archived", archivedFromStatus: "published" }) });
    w.conflictIndex();
    const r = await post(w, { action: "restore", assignmentId: "p1" });
    expect(r.status).toBe(503);
    expect(doc(w, "p1").status).toBe("archived");
  });

  it("restore a previously DRAFT assignment / a legacy archive (no archivedFromStatus): draft, no pointer", async () => {
    const w = world({ ...readyIndex([]), [AP + "d1.json"]: seededAssignment("d1", { status: "archived", archivedFromStatus: "draft" }), [AP + "l1.json"]: seededAssignment("l1", { status: "archived" }) });
    w.rc.reset();
    expect((await post(w, { action: "restore", assignmentId: "d1" })).jsonBody.assignment.status).toBe("draft");
    expect((await post(w, { action: "restore", assignmentId: "l1" })).jsonBody.assignment.status).toBe("draft");
    expect(ids(w)).toEqual([]);
    expect(w.rc.uploadsOf(IX)).toBe(0);
  });

  it("purge removes a leftover pointer after the physical delete; a cleanup failure never fails the purge", async () => {
    const arch = over => seededAssignment(over.assignmentId, { status: "archived", archivedFromStatus: "published", ...over });
    const w = world({ ...readyIndex(["x1", "x2"]), [AP + "x1.json"]: arch({ assignmentId: "x1" }), [AP + "x2.json"]: arch({ assignmentId: "x2" }) });
    let r = await post(w, { action: "purge", assignmentId: "x1", confirmAssignmentId: "x1", confirmTitle: "واجب x1" });
    expect(r.status).toBe(200);
    expect(w.ctx.has(AP + "x1.json")).toBe(false);
    expect(ids(w)).toEqual(["x2"]);
    w.conflictIndex();
    r = await post(w, { action: "purge", assignmentId: "x2", confirmAssignmentId: "x2", confirmTitle: "واجب x2" });
    expect(r.status).toBe(200);
    expect(w.ctx.has(AP + "x2.json")).toBe(false);
    expect(ids(w)).toEqual(["x2"]);                                                // stale pointer to a missing blob
    w.heal();
    expect(await readerIds(w)).toEqual([]);                                       // ignored by readers
  });
});

describe("12E-B writers — concurrent publish during a legacy bootstrap (real handlers)", () => {
  it("a REAL published create that runs between the dashboard's legacy scan and its bootstrap CAS is never lost; the next dashboard shows it", async () => {
    const w = world({ [AP + "old.json"]: seededAssignment("old") });             // legacy class: no index yet
    let createdId = null;
    const racingList = async (c, prefix) => {
      const docs = await listJson(c, prefix);
      if (prefix === AP && !createdId) createdId = (await create(w, true, "جديد")).jsonBody.assignment.assignmentId;
      return docs;
    };
    const studentDeps = { container: w.ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1 } }), recordGlobalRankMilestone: async () => {}, aggregateRecognition: async () => new Map() };
    const req = { method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } };
    const first = await dashboard(req, { ...studentDeps, listJson: racingList });
    expect(first.status).toBe(200);
    expect(createdId).toBeTruthy();
    expect(idx(w)).toMatchObject({ ready: true });
    expect(ids(w).sort()).toEqual(["old", createdId].sort());
    const next = await dashboard(req, studentDeps);
    expect(next.jsonBody.assignments.map(a => a.assignmentId).sort()).toEqual(["old", createdId].sort());
  });
});
